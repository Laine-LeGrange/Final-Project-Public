"use client";
// Mark as client component

// Import necessary modules and components
import React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Play,
  MoreVertical,
  RotateCcw,
  CheckCircle,
  Calendar,
  X,
  Eye,
  Trash2,
  ClipboardList,
  Loader2,
} from "lucide-react";
import type { Topic } from "@/components/AppShell";
import { QuizzesSkeleton } from "@/components/skeletons";
import { ago, fmtDateTime } from "@/lib/datetime";

// Define types for quiz difficulties and quiz data
type DbDifficulty = "easy" | "medium" | "hard";
type UiDifficulty = "Easy" | "Medium" | "Hard";

// Define the structure of a quiz row from the database
type QuizRow = {
  id: string;
  name: string;
  difficulty: DbDifficulty;
  length: number;
  created_at: string;
  scope: string | null;
  status?: "pending" | "processing" | "ready" | "failed" | null;
};

// Define the structure for latest quiz statistics
type LatestStat = {
  quiz_id: string;
  last_taken_at: string | null;
  last_score_percent: number | null;
};

// Define the structure for a quiz card used in the UI
type QuizCard = {
  id: string;
  name: string;
  questionCount: number;
  difficulty: UiDifficulty;
  createdAt: Date;
  lastTakenAt?: Date;
  lastScore?: number;
  scope?: string | null;
  status?: QuizRow["status"];
};

// Define constants for API base URL and Supabase anon key
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Utility functions for formatting dates, converting difficulties, and styling
function fmt(d?: Date) {
  return d ? new Date(d).toLocaleString() : "";
}
function toUiDiff(d: DbDifficulty): UiDifficulty {
  return d === "easy" ? "Easy" : d === "hard" ? "Hard" : "Medium";
}
function scoreColor(s: number) {
  return s >= 80
    ? "bg-green-200 text-green-800"
    : s >= 60
    ? "bg-yellow-200 text-yellow-800"
    : "bg-red-200 text-red-800";
}

// Function to render status badges based on quiz status
function statusBadge(status?: QuizRow["status"]) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="px-1.5 py-0 text-[11px]">
          Pending
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[11px]">
          <Loader2 className="h-3 w-3 animate-spin" /> Generating
        </Badge>
      );
    case "ready":
      return <Badge className="px-1.5 py-0 text-[11px]">Ready</Badge>;
    case "failed":
      return (
        <Badge variant="destructive" className="px-1.5 py-0 text-[11px]">
          Failed
        </Badge>
      );
    default:
      return null;
  }
}

// Main component to display and manage quizzes for a given topic
export function TopicQuizzes({ topic }: { topic: Topic }) {
  // Initialize Supabase client and router
  const supabase = React.useMemo(() => supabaseBrowser(), []);
  const router = useRouter();

  // Define state variables for loading, error, quizzes, and quiz generation
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [quizzes, setQuizzes] = React.useState<QuizCard[]>([]);
  const [generating, setGenerating] = React.useState<string | null>(null);

  // State for dialog visibility and quiz configuration
  const [open, setOpen] = React.useState(false);
  const [config, setConfig] = React.useState<{
    name: string;
    scope: string;
    difficulty: DbDifficulty | "";
    count: "5" | "10" | "20" | "";
  }>({ name: "", scope: "", difficulty: "", count: "" });

  // Function to refresh the list of quizzes from the backend
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch authenticated user
      const { data: auth } = await supabase.auth.getUser();
      const authed = auth?.user;
      if (!authed) {
        setQuizzes([]);
        setLoading(false);
        return;
      }

      // Fetch quizzes for the current topic and user
      const { data: qrows, error: qErr } = await supabase
        .from("quizzes")
        .select("id,name,difficulty,length,created_at,scope,status")
        .eq("topic_id", topic.id)
        .eq("user_id", authed.id)
        .order("created_at", { ascending: false });

      if (qErr) throw qErr;

      // Fetch latest statistics for the quizzes
      const ids = (qrows ?? []).map((q) => q.id);
      let statsMap = new Map<string, LatestStat>();

      // Only fetch stats if there are quiz IDs
      if (ids.length) {
        const { data: stats, error: sErr } = await supabase
          .from("quiz_latest_stats")
          .select("quiz_id,last_taken_at,last_score_percent")
          .in("quiz_id", ids);
        if (sErr) throw sErr;
        statsMap = new Map(
          (stats ?? []).map((s) => [s.quiz_id, s as LatestStat])
        );
      }

      // Map database rows to UI quiz cards
      const cards: QuizCard[] = (qrows ?? []).map((r) => {
        const s = statsMap.get(r.id);
        return {
          id: r.id,
          name: r.name,
          questionCount: r.length,
          difficulty: toUiDiff(r.difficulty as DbDifficulty),
          createdAt: new Date(r.created_at),
          lastTakenAt: s?.last_taken_at ? new Date(s.last_taken_at) : undefined,
          lastScore: s?.last_score_percent ?? undefined,
          scope: (r as QuizRow).scope ?? undefined,
          status: (r as QuizRow).status ?? undefined,
        };
      });

      // Update state with fetched quizzes
      setQuizzes(cards);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load quizzes");
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  };

  // Refresh quizzes when the component mounts or the topic ID changes
  React.useEffect(() => {
    void refresh();
  }, [topic.id]);

  // ---------- Functions to handle quiz actions: start, view results, delete, generate, and regenerate ----------
  // Start quiz handler
  const startQuiz = (q: QuizCard) => {
    router.push(`/topics/${topic.id}/quizzes/${q.id}`);
  };

  // View results handler
  const viewResults = (q: QuizCard) => {
    router.push(`/topics/${topic.id}/quizzes/${q.id}/results`);
  };

  // Delete quiz handler
  const deleteQuiz = async (q: QuizCard) => {
    const { error } = await supabase.from("quizzes").delete().eq("id", q.id);
    if (!error) void refresh();
  };

  // Call backend API to generate a quiz
  const callBackendGenerate = async (quizId: string, body: any) => {
    // Get auth token for the request
    const supa = supabaseBrowser();
    let authHeader: Record<string, string> = {};
    try {
      const {
        data: { session },
      } = await supa.auth.getSession();
      const token = session?.access_token;
      if (token) authHeader = { Authorization: `Bearer ${token}` };
    } catch {}

    // Make the API request to generate the quiz
    const res = await fetch(`${API_BASE}/api/rag/quizzes/${quizId}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
        ...(SUPABASE_ANON ? { apikey: SUPABASE_ANON } : {}),
      },
      // Send the config in the request body
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail?.detail || `Generate failed (${res.status})`);
    }
    return res.json();
  };

  // Poll the quiz status until it's ready or failed
  const pollStatus = async (quizId: string) => {
    // Polling loop with a maximum of 20 attempts
    for (let i = 0; i < 20; i++) {
      const { data, error } = await supabase
        .from("quizzes")
        .select("status")
        .eq("id", quizId)
        .single();
      if (!error) {
        // If status is ready or failed, exit the loop
        const s = (data?.status || "pending") as QuizRow["status"];
        if (s === "ready" || s === "failed") break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setGenerating(null);
    await refresh();
  };

  // Generate new quiz handler
  const generate = async () => {
    try {
      // Get authenticated user
      const { data: auth } = await supabase.auth.getUser();
      const authed = auth?.user;
      if (!authed) throw new Error("You must be signed in.");

      // Get quiz name and scope input
      const name =
        config.name.trim() ||
        (config.scope.trim()
          ? `Quiz — ${config.scope.trim().slice(0, 40)}`
          : "Untitled quiz");

      // Insert new quiz record in the database
      const { data: inserted, error } = await supabase
        .from("quizzes")
        .insert({
          topic_id: topic.id,
          user_id: authed.id,
          name,
          difficulty: (config.difficulty || "medium") as DbDifficulty,
          length: parseInt((config.count || "10") as string, 10),
          scope: config.scope.trim() || null,
          status: "pending",
        })
        .select("id")
        .single();

      if (error) throw error;
      const quizId = inserted?.id as string;
      setOpen(false);
      setConfig({ name: "", scope: "", difficulty: "", count: "" });

      // Call backend to start quiz generation
      setGenerating(quizId);
      await callBackendGenerate(quizId, {
        topic_id: topic.id,
        scope: config.scope.trim() || null,
        count: parseInt((config.count || "10") as string, 10),
        difficulty: (config.difficulty || "medium") as DbDifficulty,
      });
      // Poll for status updates
      await pollStatus(quizId);
    } catch (e) {
      console.error(e);
      setGenerating(null);
    }
  };

  // Regenerate quiz handler
  const regenerate = async (q: QuizCard) => {
    try {
      setGenerating(q.id);
      // Call backend to regenerate the quiz
      await callBackendGenerate(q.id, {
        topic_id: topic.id,
        scope: q.scope || null,
        count: q.questionCount,
        difficulty: q.difficulty.toLowerCase() as DbDifficulty,
      });
      await pollStatus(q.id);
    } catch (e) {
      console.error(e);
      setGenerating(null);
    }
  };

  // ---------- Render the component UI ----------
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between mt-5">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Quiz</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Test your understanding of your uploaded content
          </p>
        </div>

        {/* Dialog for generating new quiz */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Generate New Quiz
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg [&>button[aria-label='Close']]:hidden">
            <DialogClose asChild>
              <button
                aria-label="Close"
                className="absolute right-3 top-3 rounded-full p-1.5 transition-colors hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogClose>

            {/* Dialog Header */}
            <DialogHeader>
              <DialogTitle className="text-xl">Generate New Quiz</DialogTitle>
              <DialogDescription>
                Create a quiz from your topic’s knowledge base.
              </DialogDescription>
            </DialogHeader>

            {/* Dialog Body with form inputs */}
            <div className="space-y-4">
              <div className="space-y-2">
                {/* Quiz Name */}
                <Label>Quiz Name</Label>
                <Input
                  placeholder="Enter quiz name"
                  value={config.name}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>

              {/* Quiz Scope */}
              <div className="space-y-2">
                <Label>Focus areas (optional)</Label>
                <Textarea
                  placeholder="e.g., Linear algebra: eigenvalues; CNNs vs RNNs; evaluation metrics"
                  value={config.scope}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, scope: e.target.value }))
                  }
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Describe the parts of your uploaded files to test.
                </p>
              </div>

              {/* Difficulty Selection */}
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={config.difficulty}
                  onChange={(e) =>
                    setConfig((p) => ({
                      ...p,
                      difficulty: e.target.value as DbDifficulty,
                    }))
                  }
                >
                  <option value="" disabled>
                    Choose difficulty
                  </option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              {/* Question Count Selection */}
              <div className="space-y-2">
                <Label>Number of Questions</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={config.count}
                  onChange={(e) =>
                    setConfig((p) => ({
                      ...p,
                      count: e.target.value as "5" | "10" | "20",
                    }))
                  }
                >
                  <option value="" disabled>
                    Choose count
                  </option>
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <Button
                  className="flex-1"
                  onClick={generate}
                  disabled={!config.difficulty || !config.count || !!generating}
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Generate
                </Button>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={!!generating}>
          <DialogContent
            className="sm:max-w-md [&>button[aria-label='Close']]:hidden"
            aria-busy="true"
          >
            <DialogHeader>
              {/* Dialog Header for generating quiz modal */}
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating your quiz…
              </DialogTitle>
              <DialogDescription className="mt-5">
                Get ready! Your quiz is being prepared. This usually takes under
                1 minute.
              </DialogDescription>
            </DialogHeader>

            <div className=" flex justify-end">
              <Button variant="ghost" onClick={() => setGenerating(null)}>
                Hide
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Loading state */}
      {loading ? (
        <QuizzesSkeleton rows={5} />
      ) : error ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : quizzes.length === 0 ? (
        // No quizzes state
        <Card className="shadow-none">
          <CardContent className="p-12 text-center">
            <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No quizzes yet</h3>
            <p className="text-muted-foreground mb-4">
              Generate a quiz from your topic to get started.
            </p>
            <Button onClick={() => setOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Generate New Quiz
            </Button>
          </CardContent>
        </Card>
      ) : (
        // List of quizzes
        <div className="space-y-2.5">
          {quizzes.map((q) => {
            const hasResults =
              typeof q.lastScore === "number" || !!q.lastTakenAt;

            return (
              // Quiz card ----------------
              <Card
                key={q.id}
                className="hover:shadow-sm shadow-none transition-shadow"
              >
                <CardContent className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{q.name}</h3>
                        <Badge
                          variant="secondary"
                          className="px-1.5 py-0 text-[11px]"
                        >
                          {q.questionCount} questions
                        </Badge>
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[11px]"
                        >
                          {q.difficulty}
                        </Badge>
                        {statusBadge(q.status)}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <span
                          className="inline-flex items-center gap-1"
                          title={fmtDateTime(q.createdAt)}
                        >
                          <Calendar className="h-3 w-3" /> Created {ago(q.createdAt)}
                        </span>
                        {q.scope && (
                          <span
                            className="truncate max-w-[420px]"
                            title={q.scope}
                          >
                            • Focus: {q.scope}
                          </span>
                        )}
                        {typeof q.lastScore === "number" && q.lastTakenAt && (
                          <>
                            <span
                              className="inline-flex items-center gap-1"
                              title={fmtDateTime(q.lastTakenAt)}
                            >
                              <CheckCircle className="h-3 w-3" /> Last attempted{" "}
                              {ago(q.lastTakenAt)}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] ${scoreColor(
                                q.lastScore
                              )}`}
                            >
                              {Math.round(q.lastScore)}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {q.status === "ready" ? (
                        typeof q.lastScore === "number" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => startQuiz(q)}
                          >
                            <RotateCcw className="h-4 w-4" /> Retake
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => startQuiz(q)}
                          >
                            <Play className="h-4 w-4" /> Start
                          </Button>
                        )
                      ) : (
                        <Button size="sm" className="h-8 gap-1.5" disabled>
                          <Loader2 className="h-4 w-4 animate-spin" /> Preparing
                        </Button>
                      )}

                      {/* Dropdown menu for quiz actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>

                        {/* Dropdown menu items */}
                        <DropdownMenuContent align="end" className="w-44">
                          {/* View Results */}
                          <DropdownMenuItem
                            disabled={!hasResults}
                            onClick={() => {
                              if (hasResults) viewResults(q);
                            }}
                            title={
                              hasResults ? "Open results" : "No results yet"
                            }
                            className={!hasResults ? "opacity-60" : undefined}
                          >
                            <Eye className="mr-2 h-4 w-4" /> View results
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />

                          {/* Regenerate quiz */}
                          <DropdownMenuItem onClick={() => regenerate(q)}>
                            <RotateCcw className="mr-2 h-4 w-4" /> Regenerate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteQuiz(q)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete quiz
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
