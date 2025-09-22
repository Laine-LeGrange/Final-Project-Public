"use client";
// mark as component

// Import necessary modules and components
import React, { useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";
import { WithAppSidebar } from "@/components/WithAppSidebar";
import type { Topic, User } from "@/components/AppShell";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import { useProfileUser } from "@/hooks/useProfileUser";

// Define types for quiz result data structures
type Choice = { id: string; text: string };

// Define the structure of each question and answer result
// Used to fetch and render quiz results
type QAResult = {
  id: string;
  prompt: string;
  correctChoiceId: string;
  yourChoiceId: string | null;
  choices: Choice[];
};

// Define the structure of stored quiz results
type Stored = { score: number; total: number; completedAt: number; detail: QAResult[] };

// Quiz results page component
export default function QuizResultsPage({
  params,
}: {
  params: Promise<{ topicId: string; quizId: string }>;
}) {
  // Extract topicId and quizId from params
  const { topicId, quizId } = use(params);

  // State and hooks for managing loading, data, and user profile
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Stored | null>(null);

  // Sidebar user from profile 
  const { user: profile } = useProfileUser({
    refetchOnWindowFocus: false,
    refetchInterval: 0,
  });
  const sidebarUser: User =
    profile
      ? {
          id: profile.id,
          name: profile.name,
          surname: profile.surname,
          email: profile.email,
          profileImage: profile.profileImage,
          isDarkMode: profile.isDarkMode,
        }
      : { id: "0", name: "Loading", surname: "", email: "", isDarkMode: false };

  const topics: Topic[] = [
    {
      id: topicId,
      name: `Topic ${topicId}`,
      category: "",
      fileCount: 0,
      quizCount: 0,
      lastActivity: "",
      isArchived: false,
      summaryReady: true,
    },
  ];

  // Fetch quiz results from database
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Ensure user is authenticated
        const { data: auth } = await supabase.auth.getUser();
        const authed = auth?.user;
        if (!authed) throw new Error("Not signed in");

        // Find the latest submitted attempt
        const { data: attempts, error: attemptsErr } = await supabase
          .from("quiz_attempts")
          .select("id, submitted_at, score_percent")
          .eq("quiz_id", quizId)
          .eq("user_id", authed.id)
          .not("submitted_at", "is", null)
          .order("submitted_at", { ascending: false })
          .limit(1);

        // Handle errors and absence of attempts
        if (attemptsErr) throw attemptsErr;
        const attempt = attempts?.[0];
        if (!attempt) throw new Error("No results found");

        // pull all questions + options for this quiz
        const { data: qrows, error: qErr } = await supabase
          .from("quiz_questions")
          .select("id,question,order_index,quiz_options(id,option_text,is_correct)")
          .eq("quiz_id", quizId)
          .order("order_index", { ascending: true });
        if (qErr) throw qErr;

        // pull the user's selected answers for this attempt
        const { data: arows, error: aErr } = await supabase
          .from("attempt_answers")
          .select("question_id, selected_option_id")
          .eq("attempt_id", attempt.id);
        if (aErr) throw aErr;

        // build a map of question_id to the selected_option_id
        const selectedByQ = new Map<string, string | null>(
          (arows || []).map((r: any) => [r.question_id as string, r.selected_option_id as string | null])
        );

        // Map rows to the QAResult[] shape
        const details: QAResult[] =
          (qrows || []).map((r: any) => {
            const correct = (r.quiz_options || []).find((o: any) => !!o.is_correct);
            return {
              id: r.id as string,
              prompt: r.question as string,

              // Find correct option ID, default to empty string if not found
              correctChoiceId: (correct?.id as string) || "",

              // Find user selected option ID from the map
              yourChoiceId: (selectedByQ.get(r.id as string) ?? null) as string | null,
              choices: (r.quiz_options || []).map((o: any) => ({
                id: o.id as string,
                text: o.option_text as string,
              })),
            };
          }) || [];

        // Compute quiz score 
        const parsed = attempt.score_percent == null ? 0 : Number.parseFloat(String(attempt.score_percent));
        const score = Math.round(Number.isFinite(parsed) ? parsed : 0);

        // Compile the stored result payload for the page
        const stored: Stored = {
          score,
          total: details.length,
          completedAt: new Date(attempt.submitted_at as string).getTime(),
          detail: details,
        };

        // Parse and set the retrieved data
        setData(stored);
      } catch (e) {
        console.error(e);

        // Redirect to quizzes page on error
        router.push(`/topics/${topicId}/quizzes`);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [quizId, topicId, supabase, router]);

  // Handler for navigating back to quizzes list
  if (loading) {
    return (
      <WithAppSidebar
        user={sidebarUser}
        topics={topics}
        currentView={{ type: "topic", topicId, page: "quizzes" }}
      >
        <div className="max-w-4xl mx-auto mt-20">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="mt-6 h-28 w-full bg-muted rounded animate-pulse" />
          <div className="mt-4 space-y-3">
            <div className="h-16 w-full bg-muted rounded animate-pulse" />
            <div className="h-16 w-full bg-muted rounded animate-pulse" />
            <div className="h-16 w-full bg-muted rounded animate-pulse" />
          </div>
        </div>
      </WithAppSidebar>
    );
  }
  // If no quiz results data is found, show a message
  if (!data) {
    return (
      <WithAppSidebar
        user={sidebarUser}
        topics={topics}
        currentView={{ type: "topic", topicId, page: "quizzes" }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Quiz Results</h1>
            <Button variant="outline" onClick={() => router.push(`/topics/${topicId}/quizzes`)}>
              Back to quizzes
            </Button>
          </div>
          <p className="mt-6 text-muted-foreground">No results found for this quiz yet.</p>
        </div>
      </WithAppSidebar>
    );
  }

  // Calculate correct answers and score badge color
  const correctCount = data.detail.filter((d) => d.yourChoiceId === d.correctChoiceId).length;

  // Determine score badge color
  const scoreBadge =
    data.score >= 80
      ? "bg-green-200 text-green-800"
      : data.score >= 60
      ? "bg-yellow-200 text-yellow-800"
      : "bg-red-200 text-red-800";

  // Render quiz results
  return (
    <WithAppSidebar
      user={sidebarUser}
      topics={topics}
      currentView={{ type: "topic", topicId, page: "quizzes" }}
    >
      {/* Quiz results header */}
      <div className="max-w-4xl mx-auto mt-20 pb-30">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Quiz Results</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/topics/${topicId}/quizzes/${quizId}`)}>
              Retake quiz
            </Button>
            <Button onClick={() => router.push(`/topics/${topicId}/quizzes`)}>Back to quizzes</Button>
          </div>
        </div>

        {/* Score summary card */}
        <Card className="mt-10 shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Your score</div>
                <div className="text-3xl font-semibold mt-1">{data.score}%</div>
              </div>
              <span className={`inline-flex items-center rounded px-2 py-1 text-sm ${scoreBadge}`}>
                {correctCount}/{data.total} correct
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Detailed question results */}
        <div className="mt-4 space-y-3">
          {data.detail.map((d, idx) => {
            const correct = d.yourChoiceId === d.correctChoiceId;
            const your = d.choices.find((c) => c.id === d.yourChoiceId)?.text ?? "—";
            const corr = d.choices.find((c) => c.id === d.correctChoiceId)?.text ?? "—";
            return (
              <Card className="shadow-none" key={d.id}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    {correct ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    )}
                    <div className="w-full">
                      <div className="text-sm text-muted-foreground">Question {idx + 1}</div>
                      <div className="mt-0.5 font-medium">{d.prompt}</div>
                      <div className="mt-2 text-sm">
                        <div className="text-muted-foreground">
                          Your answer: <span className="text-foreground">{your}</span>
                        </div>
                        <div className="text-muted-foreground">
                          Correct answer: <span className="text-foreground">{corr}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </WithAppSidebar>
  );
}
