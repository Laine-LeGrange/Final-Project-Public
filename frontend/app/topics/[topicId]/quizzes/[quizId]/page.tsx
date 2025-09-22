"use client";
// mark as component

// Import necessary modules and components
import React, { useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { WithAppSidebar } from "@/components/WithAppSidebar";
import { QuizRunnerSkeleton } from "@/components/skeletons";
import type { Topic, User } from "@/components/AppShell";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import { useProfileUser } from "@/hooks/useProfileUser";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Define types for quiz data structures
type Choice = { id: string; text: string; isCorrect?: boolean };
type Question = { id: string; prompt: string; choices: Choice[] };


// Main component for running a quiz
export default function QuizRunnerPage({
  params,
}: {
  params: Promise<{ topicId: string; quizId: string }>;
}) {

  // Extract topicId and quizId from params
  const { topicId, quizId } = use(params);

  // Initialize router and supabase client
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  // State cariables
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState<string>("Quiz");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Sidebar
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

  // Define topics for the sidebar pass
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

  // load quiz title and questions from supabase database
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const authed = auth?.user;
        if (!authed) throw new Error("Not signed in");

        // pull quiz info
        const { data: quizRow, error: quizErr } = await supabase
          .from("quizzes")
          .select("name,status")
          .eq("id", quizId)
          .single();
        if (quizErr) throw quizErr;
        setTitle(quizRow?.name || "Quiz");

        // ensure quiz is ready
        if (quizRow?.status !== "ready") {
          throw new Error("This quiz is not ready yet.");
        }

        // pull questions and options
        const { data: qrows, error: qErr } = await supabase
          .from("quiz_questions")
          .select(
            "id,question,order_index,quiz_options(id,option_text,is_correct)"
          )
          .eq("quiz_id", quizId)
          .order("order_index", { ascending: true });

        if (qErr) throw qErr;

        // map to Question[]
        const qs: Question[] =
          (qrows || []).map((r: any) => ({
            id: r.id as string,
            prompt: r.question as string,
            choices: (r.quiz_options || []).map((o: any) => ({
              id: o.id as string,
              text: o.option_text as string,
              isCorrect: !!o.is_correct,
            })),
          })) || [];

        // Ensure there are questions
        if (!qs.length) throw new Error("No questions found for this quiz.");

        setQuestions(qs);
      } catch (e: any) {
        console.error(e);
        // Redirect to quizzes list on error
        router.push(`/topics/${topicId}/quizzes`);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [quizId, topicId, supabase, router]);

  // Show loading state while fetching data
  if (loading) {
    return (
      <WithAppSidebar
        user={sidebarUser}
        topics={topics}
        currentView={{ type: "topic", topicId, page: "quizzes" }}
      >
        <QuizRunnerSkeleton />
      </WithAppSidebar>
    );
  }

  // Get current question and progress
  const q = questions[index];
  const total = questions.length;
  const progress = Math.round(((index + 1) / total) * 100);

  // Handlers for navigation and submission
  const next = () => (index < total - 1 ? setIndex(index + 1) : submit());
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  // Submit quiz answers and handle result storage and redirection
  const submit = async () => {
    try {
      // ensure signed in
      const { data: auth } = await supabase.auth.getUser();
      const authed = auth?.user;
      if (!authed) throw new Error("Not signed in");

      // create attempt
      const { data: attemptIns, error: aErr } = await supabase
        .from("quiz_attempts")
        .insert({
          quiz_id: quizId,
          user_id: authed.id,
        })
        .select("id")
        .single();
      if (aErr) throw aErr;
      const attemptId = attemptIns.id as string;

      // build payload for answers
      const details = questions.map((qq) => {
        const selectedId = answers[qq.id] ?? null;
        const correctOpt = qq.choices.find((c) => c.isCorrect);
        return {
          id: qq.id,
          prompt: qq.prompt,
          correctChoiceId: correctOpt?.id || "",
          yourChoiceId: selectedId,
          choices: qq.choices.map((c) => ({ id: c.id, text: c.text })),
        };
      });

      // insert attempt_answers
      const answerRows = details.map((d) => ({
        attempt_id: attemptId,
        question_id: d.id,
        selected_option_id: d.yourChoiceId,
        is_correct: !!(d.yourChoiceId && d.yourChoiceId === d.correctChoiceId),
      }));
      if (answerRows.length) {
        const { error: aaErr } = await supabase
          .from("attempt_answers")
          .insert(answerRows);
        if (aaErr) throw aaErr;
      }

      // compute quiz score
      const correct = details.filter(
        (d) => d.yourChoiceId === d.correctChoiceId
      ).length;
      const score = Math.round((correct / total) * 100);

      // finalize the quiz attempt
      const { error: updErr } = await supabase
        .from("quiz_attempts")
        .update({
          submitted_at: new Date().toISOString(),
          score_percent: score,
          duration_sec: null,
        })
        .eq("id", attemptId);
      if (updErr) throw updErr;

      // keep local copy so results page works
      localStorage.setItem(
        `quiz:${quizId}:result`,
        JSON.stringify({
          score,
          total,
          completedAt: Date.now(),
          detail: details,
        })
      );
      // redirect to results page
      router.push(`/topics/${topicId}/quizzes/${quizId}/results`);
    } catch (e) {
      console.error(e);
      // Redirect to quizzes list on error
      router.push(`/topics/${topicId}/quizzes`);    
    }
  };

  // Handler for back button with confirmation if the quiz is in progress, first question has been answered at least 
  const onBackClick = () => {
    const hasProgress = Object.keys(answers).length > 0 || index > 0;
    if (hasProgress) {
      // show confirmation dialog
      setConfirmOpen(true);
    } else {
      // no progress, just go back
      router.push(`/topics/${topicId}/quizzes`);
    }
  };

  // Confirm leaving the quiz and navigate back to quizzes list
  const confirmLeave = () => {
    setConfirmOpen(false);
    router.push(`/topics/${topicId}/quizzes`);
  };

  // Render the quiz interface with sidebar
  return (
    <WithAppSidebar
      user={sidebarUser}
      topics={topics}
      currentView={{ type: "topic", topicId, page: "quizzes" }}
    >
      {/* Top section of quiz */}
      <div className="mx-auto max-w-4xl mt-20">
        <div className="flex items-center justify-between">
          {/* Quiz title */}
          <h1 className="text-3xl font-semibold">{title}</h1>

          {/* Back button */}
          <Button variant="outline" onClick={onBackClick}>
            Back to quizzes
          </Button>
        </div>

        {/* Progress bar */}
        <div className="mt-8 h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Current question card */}
        <Card className="mt-10 shadow-none bg-transparent border-none">
          <CardContent className="p-2">
            <div className="text-sm text-muted-foreground mb-2">
              Question {index + 1} of {total}
            </div>
            <h2 className="text-xl font-medium">{q.prompt}</h2>

            {/* Question radio group */}
            <RadioGroup
              className="mt-8 space-y-1"
              value={answers[q.id] ?? ""}
              onValueChange={(val) =>
                setAnswers((p) => ({ ...p, [q.id]: val }))
              }
            > 
              {q.choices.map((c) => {
                const id = `${q.id}-${c.id}`;
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 rounded-md border p-3 hover:bg-accent"
                  >
                    <RadioGroupItem id={id} value={c.id} />
                    <Label htmlFor={id} className="cursor-pointer">
                      {c.text}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>

              {/* Navigation buttons */}
            <div className="mt-10 flex justify-between">
              <Button variant="outline" onClick={prev} disabled={index === 0}>
                Previous
              </Button>
              <Button onClick={next}>
                {index === total - 1 ? "Submit" : "Next"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation dialog for leaving the quiz */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress will be lost if you leave now. Are you sure you want
              to go back to the quizzes list?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>

            {/* Leave quiz button */}
            <AlertDialogAction onClick={confirmLeave}>
              Leave quiz
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WithAppSidebar>
  );
}
