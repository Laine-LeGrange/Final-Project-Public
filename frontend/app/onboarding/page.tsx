"use client";
// Mark as client component

// Import required modules and components
import * as React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabase-browser";

// Import UI components
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { CheckIcon } from "lucide-react";

// Define question types and structure
type QuestionType = "button" | "multibutton" | "input";

// Question interface
interface Question {
  id:
    | "education_level"
    | "learning_style"
    | "explanation_format"
    | "study_goals"
    | "tone";
  title: string;
  type: QuestionType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

// Predefined options for questions
const Q = {
  EDUCATION_OTHER: "Other",
  LEARNING_NOPREF: "No preference",
  EXPLAIN_NOPREF: "No preference",
  GOALS_NONE: "Nothing specific",
  TONE_NOPREF: "No preference",
};

// List of onboarding questions
const QUESTIONS: Question[] = [
  {
    id: "education_level",
    title: "Q1. What is your education level?",
    type: "button",
    options: ["High school", "University (undergrad)", "Postgraduate", Q.EDUCATION_OTHER],
    required: true,
  },
  {
    id: "learning_style",
    title: "Q2. What is your preferred learning style?",
    type: "button",
    options: [
      "Reading (structured text)",
      "Listening (audio-style explanations)",
      "Storytelling / conversational style",
      "Visuals (step-by-step, examples, diagrams)",
      Q.LEARNING_NOPREF,
    ],
    required: true,
  },
  {
    id: "explanation_format",
    title: "Q3. What format do you prefer for explanations?",
    type: "button",
    options: [
      "Concise summaries",
      "Step-by-step breakdowns",
      "Detailed deep-dive explanations",
      "Examples + analogies",
      Q.EXPLAIN_NOPREF,
    ],
    required: true,
  },
  {
    id: "study_goals",
    title: "Q4. What are your main study goals right now?",
    type: "multibutton",
    options: [
      "Revision / memorization",
      "Understanding concepts clearly",
      "Applying knowledge to assignments/projects",
      "Practicing with quizzes",
      Q.GOALS_NONE,
    ],
    required: true,
  },
  {
    id: "tone",
    title: "Q5. How formal or casual would you like the responses to be?",
    type: "button",
    options: [
      "Very formal (academic)",
      "Neutral (clear and straightforward)",
      "Friendly and conversational",
      Q.TONE_NOPREF,
    ],
    required: true,
  },
];

// Onboarding page component
export default function OnboardingPage() {

  // ───────────────────── Hooks and state ──────────────────────────────────────
  // Memoized Supabase client and router
  const supabase = React.useMemo(() => supabaseBrowser(), []);
  const router = useRouter();

  // ───────────────────── Onboarding form state ────────────────────────────────
  const [currentStep, setCurrentStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, string | string[]>>({});
  const [educationOther, setEducationOther] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isComplete, setIsComplete] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ───────────────────── Handlers and onboarding logic ────────────────────────
  const question = QUESTIONS[currentStep];
  const isLast = currentStep === QUESTIONS.length - 1;
  const progress = ((currentStep + 1) / QUESTIONS.length) * 100;
  const selectedValue = answers[question.id];
  const selectedIsOther = question.id === "education_level" && selectedValue === Q.EDUCATION_OTHER;

  // Determine if user can proceed to next step
  const canProceed = React.useMemo(() => {
    if (!question.required) return true;
    if (question.type === "multibutton") {

      // Ensure at least one option is selected
      const arr = (answers[question.id] as string[]) || [];
      return arr.length > 0;
    } else {
      const v = (answers[question.id] as string) || "";

      // Ensure a value is selected and, if "Other" is chosen, that the text input is filled
      if (!v.trim()) return false;
      if (question.id === "education_level" && v === Q.EDUCATION_OTHER) {
        return Boolean(educationOther.trim());
      }
      return true;
    }
  }, [question, answers, educationOther]);

  // Handlers to update answers state
  function setSingleAnswer(id: Question["id"], value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    // Clear "Other" text if a different education level is selected
    if (id === "education_level" && value !== Q.EDUCATION_OTHER) {
      setEducationOther("");
    }
  }

  // Toggle multi-select answers
  function toggleMultiAnswer(id: Question["id"], value: string) {
    setAnswers((prev) => {
      const current = (prev[id] as string[]) || [];
      const has = current.includes(value);

      // Special handling for "Nothing specific" option
      if (value === Q.GOALS_NONE) {
        return { ...prev, [id]: has ? [] : [Q.GOALS_NONE] };
      }

      // Add or remove the selected option
      const next = has ? current.filter((v) => v !== value) : [...current.filter((v) => v !== Q.GOALS_NONE), value];
      return { ...prev, [id]: next };
    });
  }

  // Navigate to next or previous question
  function handleNext() {
    if (isLast) {
      void handleFinish();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  // Navigate to previous question
  function handleBack() {
    if (currentStep > 0 && !isSubmitting) setCurrentStep((s) => s - 1);
  }

  // Final submission handler to save preferences to Supabase
  async function handleFinish() {
    setIsSubmitting(true);
    setError(null);
    try {
      // Prepare payload for upsert
      const education_selection = (answers["education_level"] as string) || "";
      const payload = {
        education_level: education_selection === Q.EDUCATION_OTHER ? "Other" : education_selection,
        education_level_other:
          education_selection === Q.EDUCATION_OTHER && educationOther.trim() ? educationOther.trim() : null,
        learning_style:
          (answers["learning_style"] as string) === Q.LEARNING_NOPREF ? null : ((answers["learning_style"] as string) || null),
        explanation_format:
          (answers["explanation_format"] as string) === Q.EXPLAIN_NOPREF
            ? null
            : ((answers["explanation_format"] as string) || null),
        study_goals: Array.isArray(answers["study_goals"])
          ? (answers["study_goals"] as string[]).includes(Q.GOALS_NONE)
            ? []
            : (answers["study_goals"] as string[])
          : [],
        tone: (answers["tone"] as string) === Q.TONE_NOPREF ? null : ((answers["tone"] as string) || null),
      };

      // Upsert user preferences in Supabase
      const { error: upsertErr } = await supabase
        .from("user_preferences")
        .upsert(payload, { onConflict: "user_id" });
      if (upsertErr) throw upsertErr;
      // Mark onboarding as complete and redirect to dashboard
      setIsComplete(true);
      setTimeout(() => router.replace("/dashboard"), 600);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Something went wrong while saving use preferences from onboarding.");
    } finally {
      // Reset form state
      setIsSubmitting(false);
    }
  }

  // ──────────────────────────────── Success screen ─────────────────────────────
  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center space-y-4 p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckIcon className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">All set!</h2>
              <p className="text-gray-600">Your preferences were saved. Redirecting to your dashboard…</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ──────────────────────────────── Onboarding UI ───────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Step {currentStep + 1} of {QUESTIONS.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="w-full" />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{error}</div>
        )}

        
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-center">{question.title}</h2>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Single-button question type */}
            {question.type === "button" && (
              <div className="space-y-3">
                {question.options?.map((option) => {
                  const isSelected = (answers[question.id] as string) === option;
                  return (
                    <Button
                      key={option}
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => setSingleAnswer(question.id, option)}
                      className="w-full justify-start h-auto p-4 text-left"
                      type="button"
                    >
                      {option}
                    </Button>
                  );
                })} 
                
                {selectedIsOther && (  
                  <Input
                    autoFocus
                    placeholder="Please specify your education level…"
                    value={educationOther}
                    onChange={(e) => setEducationOther(e.target.value)}
                  />
                )}
              </div>
            )}

            {/* Multi-button question type */}
            {question.type === "multibutton" && (
              <div className="space-y-3">
                {question.options?.map((option) => {
                  const current = (answers[question.id] as string[]) || [];
                  const isSelected = current.includes(option);
                  return (
                    <Button
                      key={option}
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => toggleMultiAnswer(question.id, option)}
                      className="w-full justify-start h-auto p-4 text-left"
                      type="button"
                    >
                      {option}
                    </Button>
                  );
                })}
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0 || isSubmitting}
                type="button"
              >
                Back
              </Button>

              <Button
                onClick={handleNext}
                disabled={!canProceed || isSubmitting}
                className="min-w-24"
                type="button"
              >
                {/* <LoadingSpinner /> */}
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isLast ? (
                  "Finish"
                ) : (
                  "Next"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
