"use client";
// Mark as client component

// Import necessary modules and components
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RefreshCw,
  Clock,
  FileText,
  List,
  Lightbulb,
  Volume2,
  Sparkles,
  Loader2,
  Pause,
  Play,
  Square,
} from "lucide-react";
import { SummarySkeleton } from "@/components/skeletons";
import type { Topic } from "@/components/AppShell";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ago } from "@/lib/datetime";

// Define types for summaries
type TabKey = "short" | "long" | "key_concepts";
type SummaryStatus = "pending" | "ready" | "failed";

// Database summary record type
type DbSummary = {
  id: string;
  topic_id: string;
  type: TabKey;
  status: SummaryStatus;
  content: string | null;
  updated_at: string | null;
};

// Environment variables for API and Supabase
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Icon mapping for tabs
const iconFor = (k: TabKey) =>
  k === "long" ? List : k === "key_concepts" ? Lightbulb : FileText;

// Code block renderer for markdown with syntax highlighting
function CodeBlock(props: any) {
  const { inline, className, children } = props || {};
  const match = /language-(\w+)/.exec(className || "");
  if (!inline) {
    return (
      <SyntaxHighlighter style={oneDark as any} language={match?.[1] || "text"} PreTag="div">
        {String(children || "").replace(/\n$/, "")}
      </SyntaxHighlighter>
    );
  }
  return <code className="whitespace-pre-wrap rounded bg-muted px-1 py-0.5">{children}</code>;
}

// Markdown component with custom renderers
const mdComponents: Components = {
  code: CodeBlock as any,
  a({ href, children, ...rest }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" {...rest}>
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className="border px-2 py-1 bg-muted text-left">{children}</th>;
  },
  td({ children }) {
    return <td className="border px-2 py-1 align-top">{children}</td>;
  },
  li({ children }) {
    return <li className="ml-4 list-disc">{children}</li>;
  },
};

// Markdown renderer with fallback for empty content
function Markdown({ text }: { text?: string | null }) {
  if (!text) return <p className="text-muted-foreground">No content available.</p>;
  return (
    <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
      {text}
    </ReactMarkdown>
  );
}

/**  TTS controller with Play/Pause/Resume/Stop*/
function usePageTTS(apiBase: string) {
  const [speakingId, setSpeakingId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false); // fetching the audio
  const [isPlaying, setIsPlaying] = React.useState(false); // element currently playing
  const [isPaused, setIsPaused] = React.useState(false);// paused (kept for resume)

  // Refs to manage audio element, URL, and abort controller
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const urlRef = React.useRef<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // Cleanup function to stop and release resources
  const cleanup = React.useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = "";
      a.onended = null;
      a.onerror = null;
      a.onpause = null;
      a.onplay = null;
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Reset states
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => () => cleanup(), [cleanup]);

  // Function to fetch TTS audio from backend
  const fetchTTS = React.useCallback(
    async (text: string, signal: AbortSignal) => {

      // Call the TTS API endpoint
      const res = await fetch(`${apiBase}/api/media/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal,
      });

      // Handle error
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`TTS HTTP ${res.status} ${msg || ""}`.trim());
      }

      // Return the audio blob
      return await res.blob();
    },
    [apiBase]
  );

  /** Hard stop: clears element & URL; next TTS audio play starts from beginning */
  const stop = React.useCallback(() => {
    cleanup();
    setSpeakingId(null);
    setBusy(false);
  }, [cleanup]);

  /** Pause only (keeps currentTime to allow resume - wont start from summary beginning) */
  const pause = React.useCallback(() => {
    const a = audioRef.current;
    if (a && !a.paused) {
      a.pause();
      setIsPlaying(false);
      setIsPaused(true);
    }
  }, []);

  /** Resume from last paused position */
  const resume = React.useCallback(async () => {
    const a = audioRef.current;
    if (a && a.paused) {
      await a.play();
      setIsPlaying(true);
      setIsPaused(false);
    }
  }, []);

  /** Start playback or, if same row paused, resume */
  const play = React.useCallback(
  async (rowId: string, text: string) => {
    // If another row is active, ignore to enforce single-playback
    if (speakingId && speakingId !== rowId) return;

    // If this row is already loaded & paused - resume
    if (speakingId === rowId && audioRef.current && isPaused) {
      await resume();
      return;
    }

    // If this row is already playing, stop 
    if (speakingId === rowId && audioRef.current && isPlaying) {
      stop();
      return;
    }

    // New row or was stopped - fetch & play from beginning
    try {

      // Indicate busy state
      setBusy(true);

      // Set current speaking ID
      setSpeakingId(rowId);


      // Cleanup any existing audio/url/abort
      abortRef.current = new AbortController();
      const blob = await fetchTTS(text, abortRef.current.signal);

      // Create URL and audio element
      const url = URL.createObjectURL(blob);
      urlRef.current = url;

      // Create and configure audio element
      const audio = new Audio();
      audioRef.current = audio;
      audio.src = url;

      // Setup event handlers
      audio.onended = () => stop();
      audio.onerror = () => stop();
      audio.onplay = () => {
        setIsPlaying(true);
        setIsPaused(false);
      };

      // Handle pause event to update state
      audio.onpause = () => {
        if (audioRef.current) {
          setIsPlaying(false);
          setIsPaused(true);
        }
      };
      // Start playback
      await audio.play();
    } catch (e) {
      console.error(e);
      stop();
    } finally {
      setBusy(false);
    }
  },
  [fetchTTS, isPaused, isPlaying, resume, speakingId, stop]
);

  const isSpeaking = !!speakingId; // speaking or paused for some row
  return { play, pause, resume, stop, isSpeaking, isPlaying, isPaused, speakingId, busy };
}

// ----------------------- Main component to display topic summaries with TTS functionality
export function TopicSummaries({
  topic,
}: {
  topic: Topic;
  onUpdateTopic: (t: Topic) => void;
}) {
  // State and refs for managing summaries and TTS
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DbSummary[]>([]);
  const [active, setActive] = useState<TabKey>("short");
  const [generating, setGenerating] = useState(false);

  // TTS controller state
  const { play, pause, resume, stop, isSpeaking, isPlaying, isPaused, speakingId, busy } =
    usePageTTS(API_BASE);

  // Function to load summaries from the database
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch summaries for the current topic
      const { data, error } = await supabase
        .from("topic_summaries")
        .select("id,topic_id,type,status,content,updated_at")
        .eq("topic_id", topic.id)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setRows((data ?? []) as DbSummary[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load summaries");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Load summaries on component mount and when topic changes
  useEffect(() => {
    void load();
  }, [topic.id]);

  // Map of ready summaries by type
  const readyMap = useMemo(() => {
    const map = new Map<TabKey, DbSummary>();
    for (const r of rows) {
      // Only consider ready summaries, prefer first of each type
      if (r.status === "ready" && !map.has(r.type)) {
        map.set(r.type, r);
      }
    }
    return map;
  }, [rows]);

  // Manage active tab based on available summaries
  const availableTabs = useMemo(() => Array.from(readyMap.keys()), [readyMap]);
  const hasAnySummaries = availableTabs.length > 0;

  // Ensure active tab is valid
  useEffect(() => {
    if (!hasAnySummaries) return;
    if (!availableTabs.includes(active)) {
      setActive(availableTabs[0]);
    }
  }, [availableTabs, active, hasAnySummaries]);

  // Handler to refresh summaries
  const handleRefresh = async () => {
    if (!hasAnySummaries) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  // Handler to generate new summaries
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      let authHeader: Record<string, string> = {};
      try {
        // Get Supabase auth token for the request
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) authHeader = { Authorization: `Bearer ${token}` };
      } catch {}

      // Call the backend API to generate summaries
      const res = await fetch(`${API_BASE}/api/rag/summaries/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
          ...(SUPABASE_ANON ? { apikey: SUPABASE_ANON } : {}),
        },
        body: JSON.stringify({
          topic_id: topic.id,
          prefs: {},
        }),
      });

      // Handle error
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to generate summaries");
    } finally {
      setGenerating(false);
    }
  };

  // Render the component
  return (
    <div className="space-y-6 mb-20">  

      {/* Card for topic summaries */}
      <Card className="border-0 shadow-none bg-transparent p-0 mt-5">
        <CardHeader className="px-0 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-3xl font-semibold tracking-tight flex items-center gap-2">
                Topic Summaries
                <Badge variant={hasAnySummaries ? "default" : "secondary"}>
                  {hasAnySummaries ? "Ready" : "Not generated"}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-2">
                AI-generated summaries of your uploaded documents
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="gap-2 bg-primary shadow-none text-white hover:bg-gray-700 hover:text-white"
                onClick={handleRefresh}
                disabled={!hasAnySummaries || refreshing}
                title={!hasAnySummaries ? "Generate summaries first" : "Refresh"}
              >
                <RefreshCw className={`h-4 w-4 stroke-white ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={handleGenerate} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "Generating…" : "Generate Summaries"}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Loading or error state */}
      {loading || (generating && !hasAnySummaries) ? (
        <SummarySkeleton />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !hasAnySummaries ? (
        <Card className="shadow-none">
          <CardContent className="p-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No summaries yet</h3>
            <p className="text-muted-foreground mb-4">
              Generate AI summaries once you’ve uploaded documents to this topic.
            </p>
            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Starting…" : "Generate Summaries"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        // Tabs for available summaries
        <Tabs value={active} onValueChange={(v) => setActive(v as TabKey)} className="space-y-4">
          <TabsList className="w-full sm:w-auto">
            {availableTabs.includes("short") && <TabsTrigger value="short">Short Summary</TabsTrigger>}
            {availableTabs.includes("long") && <TabsTrigger value="long">Long Summary</TabsTrigger>}
            {availableTabs.includes("key_concepts") && <TabsTrigger value="key_concepts">Key Concepts</TabsTrigger>}
          </TabsList>

          {/* Tab contents */}
          {availableTabs.map((key) => {
            const row = readyMap.get(key)!;
            const Icon = iconFor(key); // leaving the icon out for now - looks cluttered
            const updated = ago(row.updated_at);
            const thisIsSpeaking = speakingId === row.id;

            // Render each tab content with summary and TTS controls
            return (
              <TabsContent key={key} value={key}>

                {/* Summary content */}
                <Card className="border-none shadow-none bg-muted">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Last updated {updated}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Primary button: Listen, Pause, Resume */}
                        <Button
                          variant={thisIsSpeaking && isPlaying ? "secondary" : "default"}
                          className="gap-2 shadow-none border hover:text-primary hover:border-gray-500 hover:bg-muted"
                          disabled={busy && !thisIsSpeaking}
                          onClick={() => {
                            if (!row?.content) return;

                            if (thisIsSpeaking) {
                              if (isPlaying) return pause();
                              if (isPaused) return resume(); 
                            }

                            // idle or different row - start
                            return play(row.id, row.content!);
                          }}

                          // Dynamic title based on state
                          title={
                            thisIsSpeaking
                              ? isPlaying
                                ? "Pause"
                                : "Resume"
                              : isSpeaking
                              ? "Another summary is playing"
                              : "Listen"
                          }
                        >
                          {thisIsSpeaking ? (
                            // Show Pause or Play icon based on playing state
                            isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />
                          ) : (
                            <Volume2 className="h-4 w-4" />
                          )}
                          {thisIsSpeaking ? (isPlaying ? "Pause" : "Resume") : "Listen"}
                        </Button>

                        {/* Stop button: visible only when this row is speaking (playing OR paused) */}
                        {thisIsSpeaking && (
                          <Button
                            variant="destructive"
                            className="gap-2 shadow-none"
                            onClick={stop}
                            title="Stop and reset to the beginning"
                          >
                            <Square className="h-4 w-4" />
                            Stop
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {/* Summary content */}
                  <CardContent>
                    <div className="rounded-lg bg-transparent pb-4 leading-relaxed">
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <Markdown text={row.content} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
