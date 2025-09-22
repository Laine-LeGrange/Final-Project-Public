"use client";
// Mark as client component

// Import React and necessary UI components and icons
import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  ArrowUp,
  Mic,
  Volume2,
  Copy,
  Bot,
  Sparkles,
  Loader2,
  FileText,
  Trash2,
  Check,
  MessagesSquare,
} from "lucide-react";
import type { Topic } from "@/components/AppShell";
import { supabaseBrowser } from "@/app/lib/supabase-browser";

// Import markdown rendering libraries and plugins
import ReactMarkdown, { type Components } from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// Import text-to-speech function
import { speak } from "@/app/lib/tts";


/* Markdown helpers */

// Code block component with syntax highlighting
function CodeBlock(props: any) {
  const { inline, className, children } = props || {};
  const match = /language-(\w+)/.exec(className || "");
  if (!inline) {
    return (
      <SyntaxHighlighter
        style={oneDark as any}
        language={match?.[1] || "text"}
        PreTag="div"
      >
        {String(children || "").replace(/\n$/, "")}
      </SyntaxHighlighter>
    );
  }
  return (
    <code className="whitespace-pre-wrap rounded bg-muted px-1 py-0.5">
      {children}
    </code>
  );
}

// Custom markdown components
const mdComponents: Components = {
  code: CodeBlock as any,
  a({ href, children, ...rest }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
        {...rest}
      >
        {children}
      </a>
    );
  },
  // Table component
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

// Markdown rendering component
function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={mdComponents}
    >
      {text}
    </ReactMarkdown>
  );
}

/* ----------------- Types & constants* ----------------- */

// Message sender type
type Sender = "user" | "assistant";

// Message structure
interface Message {
  id: string;
  content: string;
  sender: Sender;
  contexts?: Array<{ file_name?: string | null; document_id?: string | null }>;
  error?: boolean;
}

// API and WebSocket base URLs
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const WS_BASE = API_BASE.replace(/^http/, "ws");
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Local storage keys for session and chat messages
const sessionKeyFor = (topicId: string) => `centry-session-${topicId}`;
const messagesKeyFor = (topicId: string, sessionId: string) =>
  `centry-chat-${topicId}-${sessionId}`;

// Normalize user preferences, ensuring study_goals is an array
function normalizePrefs(p: any): Record<string, any> {
  const out = { ...(p || {}) };
  const sg = out.study_goals;
  if (typeof sg === "string") {
    out.study_goals = sg
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  } else if (!Array.isArray(sg)) {
    out.study_goals = [];
  }
  return out;
}

/* Tiny toast - this is the pop up that shows after copying text from the clipboard*/

// Toast component to show "Copied to clipboard" message
function CopiedToast({ visible }: { visible: boolean }) {
  return (
    <div
      aria-live="polite"
      className={`border-muted border fixed top-20 left-[50vw] z-50 flex items-center gap-2 px-3 py-2 rounded-md bg-foreground-muted text-primary text-sm shadow-lg transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <Check className="h-4 w-4" />
      Copied to clipboard!
    </div>
  );
}


/* WebSocket ASR hook*/
// Custom hook to manage ASR WebSocket connection and media recording
function useASRWebSocket(
  wsUrl: string,
  onPartial: (txt: string) => void, // callback for partial transcripts
  onFinal: (txt: string) => void // callback for final transcript
) {
  // Refs and state
  const wsRef = React.useRef<WebSocket | null>(null);
  const mediaRef = React.useRef<MediaRecorder | null>(null);
  const partialRef = React.useRef<string>(""); // accumulate partials
  const [recording, setRecording] = React.useState(false);

  // Start recording and WebSocket connection
  const start = React.useCallback(async () => {
    if (recording) return;

    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Create MediaRecorder
    const mr = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
    });

    // Set up WebSocket connection
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    // Handle WebSocket events
    ws.onopen = () => {
      mr.start(250);
      partialRef.current = "";
      setRecording(true); // update state on successful recording start
    };

    // Handle incoming WebSocket messages
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        // Process partial and final transcripts
        if (msg.type === "partial") {
          const incoming = (msg.text || "").trim();
          if (incoming && incoming !== partialRef.current) {
            partialRef.current = incoming;

            // Invoke partial callback
            onPartial(partialRef.current);
          }
        } else if (msg.type === "final") {
          const finalText = (msg.text || partialRef.current || "").trim();
          partialRef.current = "";

          // Invoke final callback
          onFinal(finalText);
        }
      } catch {
      }
    };

    // Handle WebSocket closure and errors
    ws.onclose = () => {
      setRecording(false);
    };

    // Handle WebSocket errors
    ws.onerror = () => {
      setRecording(false);
    };

    wsRef.current = ws;

    // Send audio data when available
    mr.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(e.data); 
      }
    };
    mediaRef.current = mr;
  }, [recording, wsUrl, onPartial, onFinal]);

  // Stop recording and close WebSocket connection
  const stop = React.useCallback(() => {
    if (mediaRef.current) {
      mediaRef.current.stop();
      mediaRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRef.current = null;
    }
    if (wsRef.current) {
      // Close WebSocket connection
      const endBytes = new TextEncoder().encode("__END__");
      wsRef.current.send(endBytes);
    }
    setRecording(false); // update state on stop
  }, []);

  // Cleanup on unmount
  return { start, stop, recording };
}

/* Main chat page component                                                      */
export function TopicChat({ topic }: { topic: Topic }) {

  // State variables
  const [message, setMessage] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [dbPrefs, setDbPrefs] = React.useState<Record<string, any> | null>(
    null
  );

  // Session management
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [clearOpen, setClearOpen] = React.useState(false);

  // Refs for positioning and textarea
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Copy toast state + handler
  const [copied, setCopied] = React.useState(false);
  const handleCopy = React.useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // auto hide after 1.4s
      window.setTimeout(() => setCopied(false), 1400);
    } catch (err) {
      console.error("Copy failed", err);
    }
  }, []);

  // ASR WS: live partials + keep final in box for user to edit
  const { start, stop, recording } = useASRWebSocket(
    `${WS_BASE}/api/ws/asr`,
    (partial) => {
      // On partial transcript, update message and resize textarea
      setMessage(partial);
      queueMicrotask(() => {
        const el = textareaRef.current;
        if (!el) return;
        const len = partial.length;
        el.setSelectionRange(len, len); 
        el.style.height = "0px";
        // Limit max height to 200px
        el.style.height = Math.min(el.scrollHeight, 200) + "px";
      });
    },
    // On final transcript, set message and focus textarea
    (finalText) => {
      setMessage(finalText);
      queueMicrotask(() => textareaRef.current?.focus());
    }
  );

  // Session + local history
  React.useEffect(() => {
    const skey = sessionKeyFor(topic.id);
    // Get or create session ID
    let sid = localStorage.getItem(skey);
    if (!sid) {
      // Create new session ID
      sid = crypto.randomUUID();
      localStorage.setItem(skey, sid);
    }
    setSessionId(sid);

    // Load messages from local storage
    const mkey = messagesKeyFor(topic.id, sid);
    const stored = localStorage.getItem(mkey);

    // Parse and set messages if available
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Message[];
        if (Array.isArray(parsed)) setMessages(parsed);
      } catch {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [topic.id]);

  // Persist messages to local storage on changes
  React.useEffect(() => {
    if (!sessionId) return;
    const mkey = messagesKeyFor(topic.id, sessionId);
    try {
      localStorage.setItem(mkey, JSON.stringify(messages));
    } catch {}
  }, [messages, topic.id, sessionId]);

  // Load user prefs
  React.useEffect(() => {
    (async () => {
      try {
        const supa = supabaseBrowser();
        const {
          data: { session },
        } = await supa.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) return;

        // Fetch user preferences from the database
        const { data, error } = await supa
          .from("user_preferences")
          .select("*")
          .eq("user_id", uid)
          .maybeSingle();
        if (error) return;
        setDbPrefs(normalizePrefs(data));
      } catch {}
    })();
  }, []);

  // Autoscroll
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // Textarea autosize
  const MAX_INPUT_HEIGHT = 200;
  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT);
    el.style.height = next + "px";
  };

  // Send question
  const sendQuestion = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      content: trimmed,
      sender: "user",
    };
    setMessages((prev) => [...prev, userMsg]);
    setMessage("");
    requestAnimationFrame(() => autosize());

    // Call chat API
    try {
      setLoading(true);

      // Ensure session ID
      let sid = sessionId;
      if (!sid) {
        const skey = sessionKeyFor(topic.id);
        sid = localStorage.getItem(skey) || crypto.randomUUID();
        localStorage.setItem(skey, sid);
        setSessionId(sid);
      }

      // Prepare auth header if logged in
      let authHeader: Record<string, string> = {};
      try {
        const supa = supabaseBrowser();
        const {
          data: { session },
        } = await supa.auth.getSession();
        const token = session?.access_token;
        if (token) authHeader = { Authorization: `Bearer ${token}` };
      } catch {}

      // Merge user preferences
      const mergedPrefs = normalizePrefs({ ...(dbPrefs || {}) });

      // Call the chat API endpoint
      const res = await fetch(`${API_BASE}/api/rag/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
          ...(SUPABASE_ANON ? { apikey: SUPABASE_ANON } : {}),
        },
        // Request body with question and context
        body: JSON.stringify({
          topic_id: topic.id,
          session_id: sid,
          question: trimmed,
          prefs: mergedPrefs,
          document_id: null,
          debug: false,
        }),
      });

      // Handle non-OK responses
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      // Parse response data
      const data: {
        answer?: string;
        contexts?: Array<{ file_name?: string; document_id?: string }>;
      } = await res.json();

      // Add assistant message
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: data.answer || "(sorry, no answer available)",
          sender: "assistant",
          contexts: data.contexts || [],
        },
      ]);
    } catch (e: any) {
      // Handle errors by adding an error message
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: `Sorry — chat failed: ${e?.message || String(e)}`,
          sender: "assistant",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Handle send question
  const handleSend = async () => {
    if (!message.trim()) return;
    await sendQuestion(message);
  };

  // Clear chat and start a new session
  const clearChatAndStartNewSession = React.useCallback(() => {
    if (!sessionId) return;

    // Remove old messages from local storage
    const oldKey = messagesKeyFor(topic.id, sessionId);
    localStorage.removeItem(oldKey);

    // Create new session ID
    const newSid = crypto.randomUUID();
    const skey = sessionKeyFor(topic.id);
    localStorage.setItem(skey, newSid);

    // Reset state
    setSessionId(newSid);
    setMessages([]);
    setMessage("");
  }, [sessionId, topic.id]);

  // Handle Enter key for sending message
  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    // Block Enter-to-send while recording
    if (recording && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick start suggestions
  const quickStarts = [
    "Give me a short summary of this topic.",
    "List the key concepts and explain each briefly.",
    "Explain the main ideas like I’m a beginner.",
  ];

  // Start card when no messages
  const startCard = (
    <div className="h-full w-full flex items-center justify-center px-4">
      <Card className="max-w-2xl w-full text-center border-none shadow-none">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <MessagesSquare className="h-6 w-6 text-muted-foreground" />
          </div>

          {/* Start a new chat */}
          <CardTitle className="text-2xl">Start a new chat</CardTitle>
          <CardDescription className="mt-1">
            Ask anything about <span className="font-medium">{topic.name}</span>
            . Your uploaded files power the answers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 justify-center">
            {quickStarts.map((q) => (
              <Button
                key={q}
                variant="secondary"
                className="shadow-none"
                onClick={() => setTimeout(() => sendQuestion(q), 0)}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {q}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Render the chat component
  return (
    <div className="px-10 flex mt-2 flex-col h-[calc(100vh-120px)] relative">
      <div className="mb-6 z-20 flex items-center justify-end">
        <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              className="h-8 px-3 rounded-md bg-transparent shadow-none border border-border text-muted-foreground hover:text-foreground hover:border-foreground/50 hover:bg-transparent transition-colors"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear chat
            </Button>
          </AlertDialogTrigger>

          {/* Alert dialog content */}
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear chat history?</AlertDialogTitle>

              {/* Confirmation message */}
              <AlertDialogDescription>
                This will remove all messages for the current session and start
                a brand-new session for{" "}
                <span className="font-medium">{topic.name}</span>. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>

              {/* Cancel and confirm button */}
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => {
                  clearChatAndStartNewSession();
                  setClearOpen(false);
                }}
              >
                Yes, clear chat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto space-y-4 pb-10 mb-12 pr-1
        scrollbar-thin
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb]:bg-gray-400/60"
      >
        {messages.length === 0
          ? startCard
          : messages.map((m) => {
              const uniqueContexts = (() => {
                const seen = new Set<string>();
                const out: Array<{
                  file_name?: string | null;
                  document_id?: string | null;
                }> = [];
                // Extract unique contexts
                for (const c of m.contexts ?? []) {
                  const key =
                    (c.document_id && `id:${c.document_id}`) ||
                    (c.file_name && `fn:${c.file_name}`) ||
                    `obj:${JSON.stringify(c)}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    out.push(c);
                  }
                }
                return out;
              })();

              // Show up to 3 contexts, with " more" if there are more
              const visible = uniqueContexts.slice(0, 3);
              const extra = uniqueContexts.length - visible.length;

              return (
                <div
                  key={m.id}
                  className={`flex ${
                    m.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="max-w-[80%]">
                    <div
                      className={`rounded-lg px-4 py-3 leading-relaxed border-none ${
                        m.sender === "user"
                          ? "bg-muted text-dark"
                          : m.error
                          ? "bg-destructive/10"
                          : "bg-card/40"
                      }`}
                    >
                      {m.sender === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <Markdown text={m.content} />
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">
                          {m.content}
                        </p>
                      )}

                      {m.sender === "assistant" &&
                        uniqueContexts.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2 items-center">
                            {visible.map((c, idx) => (
                              <span
                                key={`${c.document_id ?? c.file_name ?? idx}`}
                                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted/70"
                                title={c.file_name || "Source"}
                              >
                                <FileText className="h-3 w-3" />
                                {c.file_name ?? "Source"}
                              </span>
                            ))}
                            {extra > 0 && (
                              <span className="text-[11px] text-muted-foreground">
                                +{extra} more
                              </span>
                            )}
                          </div>
                        )}
                    </div>

                    <div
                      className={`mt-1 flex pl-1 items-center gap-2 text-xs text-muted-foreground ${
                        m.sender === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {m.sender === "assistant" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Listen"
                            type="button"
                            onClick={() => speak(API_BASE, m.content)}
                          >
                            <Volume2 className="h-3 w-3" />
                          </Button>

                          {/* Copy with toast */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Copy"
                            onClick={() => handleCopy(m.content)}
                            type="button"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

        {/* Show loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[80%]">
              <div className="rounded-lg px-4 py-3 leading-relaxed bg-card/40">
                <p className="text-sm whitespace-pre-wrap flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking…
                </p>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Top/bottom gradient overlays */}
      <div className="pointer-events-none absolute top-14 left-0 right-0 h-6 bg-gradient-to-b dark:from-[#0A0A0A] from-white to-transparent z-10" />
      <div className="pointer-events-none absolute bottom-40 left-0 right-0 h-6 bg-gradient-to-t dark:from-[#0A0A0A] from-white to-transparent z-10" />

      {/* Input area */}
      <div className="px-1 relative z-20">
        <div className="relative border bg-background rounded-xl pl-4 pr-28 py-3">
          <Textarea
            ref={textareaRef}
            placeholder={`Ask about "${topic.name}"`}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              const el = textareaRef.current;
              if (el) {
                el.style.height = "0px";
                const next = Math.min(el.scrollHeight, 200);
                el.style.height = next + "px";
              }
            }}
            onKeyDown={onKeyDown}
            rows={1}
            className="
              w-full resize-none border-0 bg-transparent dark:bg-transparent shadow-none p-0
              focus-visible:ring-0 focus-visible:ring-offset-0
              text-base leading-6 placeholder:text-muted-foreground
              max-h-[224px] pr-2
              [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
            "
            aria-label="Message"
            disabled={loading}
          />

          <div className="absolute bottom-2 right-2 flex gap-2">
            {/* Mic: start/stop WebSocket streaming */}
            <Button
              variant="secondary"
              size="icon"
              className={`h-10 w-10 rounded-md border ${
                recording
                  ? "bg-red-50 dark:bg-red-900/20 border-red-300 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30"
                  : ""
              }`}
              title={recording ? "Stop recording" : "Start voice input"}
              disabled={loading}
              type="button"
              onClick={() => {
                if (recording) stop();
                else start();
              }}
              aria-pressed={recording}
              aria-label={recording ? "Stop recording" : "Start voice input"}
            >
              {/* Red recording icon when recording*/}
              <Mic
                className={`h-5 w-5 ${
                  recording ? "text-red-600 animate-pulse" : ""
                }`}
              />
            </Button>

            {/* Send disabled while recording */}
            <Button
              onClick={async () => {
                if (!message.trim()) return;
                await sendQuestion(message);
              }}
              disabled={!message.trim() || loading || recording}
              className="h-10 w-10 rounded-md"
              title={recording ? "Stop recording to send" : "Send"}
              type="button"
              aria-disabled={!message.trim() || loading || recording}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ArrowUp className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* User instructions below text area */}
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
          {recording ? " — recording in progress" : ""}
        </p>
      </div>
      {/* Toast for copied messages */}
      <CopiedToast visible={copied} />
    </div>
  );
}
