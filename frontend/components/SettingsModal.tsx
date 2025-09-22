"use client";
// Mark as client component

// Import necessary modules and components
import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import { useTheme } from "next-themes";
import { useProfileUser } from "@/hooks/useProfileUser";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogOverlay,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CheckIcon, Upload as UploadIcon } from "lucide-react";

// Define props for the SettingsModal component
type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: {
    id: string;
    email: string;
    name: string;
    surname: string;
    profileImage?: string;
    isDarkMode: boolean;
  };
};

// Define sections for the settings modal
type Section = "personalization" | "theme" | "account" | "logout";

// Predefined options for user preferences
const Q = {
  EDUCATION_OTHER: "Other",
  LEARNING_NOPREF: "No preference",
  EXPLAIN_NOPREF: "No preference",
  GOALS_NONE: "Nothing specific",
  TONE_NOPREF: "No preference",
} as const;

// Options for education level, learning style, explanation format, study goals, and tone
const EDU = ["High school", "University (undergrad)", "Postgraduate", Q.EDUCATION_OTHER] as const;

const LEARNING = [
  "Reading (structured text)",
  "Listening (audio-style explanations)",
  "Storytelling / conversational style",
  "Visuals (step-by-step, examples, diagrams)",
  Q.LEARNING_NOPREF,
] as const;

const EXPLAIN = [
  "Concise summaries",
  "Step-by-step breakdowns",
  "Detailed deep-dive explanations",
  "Examples + analogies",
  Q.EXPLAIN_NOPREF,
] as const;

const GOALS = [
  "Revision / memorization",
  "Understanding concepts clearly",
  "Applying knowledge to assignments/projects",
  "Practicing with quizzes",
  Q.GOALS_NONE,
] as const;

const TONES = [
  "Very formal (academic)",
  "Neutral (clear and straightforward)",
  "Friendly and conversational",
  Q.TONE_NOPREF,
] as const;

// Settings modal component
export default function SettingsModal({ open, onOpenChange, user }: Props) {

  // Initialize Supabase client and other hooks
  const supabase = React.useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  // Fetch user profile data with periodic refresh
  const { refresh } = useProfileUser({ refetchInterval: 5000 });

  // State variables for managing form data and UI state
  const [section, setSection] = React.useState<Section>("personalization");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = React.useState(false);

  // Form fields state
  const [firstName, setFirstName] = React.useState(user.name || "");
  const [lastName, setLastName] = React.useState(user.surname || "");
  const [avatarUrl, setAvatarUrl] = React.useState<string | undefined>(user.profileImage);
  const [uploading, setUploading] = React.useState(false);

  // Preferences state
  const [educationLevel, setEducationLevel] = React.useState<string | undefined>();
  const [educationLevelOther, setEducationLevelOther] = React.useState<string>("");
  const [learningStyle, setLearningStyle] = React.useState<string | undefined>();
  const [explainFormat, setExplainFormat] = React.useState<string | undefined>();
  const [studyGoals, setStudyGoals] = React.useState<string[]>([]);
  const [tone, setTone] = React.useState<string | undefined>();

  // Theme preference state
  const [themePref, setThemePref] = React.useState<"light" | "dark">(
    (theme === "dark" ? "dark" : "light") as "light" | "dark"
  );

  // Success message state
  const [successOpen, setSuccessOpen] = React.useState(false);
  const [successText, setSuccessText] = React.useState<string>("Saved");
  const successTimerRef = React.useRef<number | null>(null);

  // Function to flash success message
  const flashSuccess = React.useCallback((msg = "Saved successfully") => {
    setSuccessText(msg);
    setSuccessOpen(true);
    // Clear any existing timer
    if (successTimerRef.current) window.clearTimeout(successTimerRef.current);

    // Auto-close success message after 2.2 seconds
    successTimerRef.current = window.setTimeout(() => setSuccessOpen(false), 2200) as unknown as number;
  }, []);

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    };
  }, []);

  // Load user profile and preferences when modal opens
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    (async () => {
      const [{ data: prof }, { data: prefs }] = await Promise.all([
        // Fetch profile and preferences in parallel
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      // Populate form fields with fetched data
      if (prof) {
        setFirstName(prof.first_name ?? "");
        setLastName(prof.last_name ?? "");
        setAvatarUrl(prof.avatar_url ?? undefined);
        setThemePref(prof.theme === "dark" ? "dark" : "light");
      }

      // Populate preferences form fields
      if (prefs) {
        const edu = (prefs.education_level as string | null) ?? undefined;
        const eduOther = (prefs.education_level_other as string | null) ?? "";

        // Handle "Other" education level case
        if (eduOther && edu !== Q.EDUCATION_OTHER) {
          setEducationLevel(Q.EDUCATION_OTHER);
        } else {
          setEducationLevel(edu);
        }

        // Set other education level
        setEducationLevelOther(eduOther ?? "");

        // Set remaining preferences
        setLearningStyle((prefs.learning_style as string | null) ?? undefined);
        setExplainFormat((prefs.explanation_format as string | null) ?? undefined);
        setStudyGoals(Array.isArray(prefs.study_goals) ? prefs.study_goals : []);
        setTone((prefs.tone as string | null) ?? undefined);
      }
    })();
  }, [open, supabase, user.id]);

  // Function to save personalization preferences
  async function savePersonalization() {

    // Set saving state and clear errors
    setSaving(true);
    setError(null);
    try {
      
      // Prepare values for upsert
      const eduValue = educationLevel ?? null;
      const eduOtherToSave =
        eduValue === Q.EDUCATION_OTHER ? (educationLevelOther.trim() || null) : null;

      // Upsert user preferences
      const { error: err } = await supabase.from("user_preferences").upsert(
        {
          user_id: user.id,
          education_level: eduValue,
          education_level_other: eduOtherToSave,
          learning_style: learningStyle ?? null, 
          explanation_format: explainFormat ?? null,   
          study_goals: studyGoals ?? [],                
          tone: tone ?? null,                          
        },
        { onConflict: "user_id" }
      );
      if (err) throw err;

      // Refresh data and show success message
      await refresh();
      flashSuccess("Personalization saved");

    // Handle errors
    } catch (e: any) {
      setError(e?.message ?? "Failed to save personalization.");
    } finally {
      setSaving(false);
    }
  }

  // Function to save theme preference
  async function saveTheme() {
    setSaving(true);
    setError(null);
    try {
      // Update theme in profile
      const { error: err } = await supabase
        .from("profiles")
        .update({ theme: themePref })
        .eq("user_id", user.id);
      if (err) throw err;

      // Apply theme change immediately
      setTheme(themePref);
      try { localStorage.setItem("centry-theme", themePref); } catch {}
      await refresh();

      // Show success message
      flashSuccess("Theme updated");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save theme.");
    } finally {
      setSaving(false);
    }
  }

  // Function to save account details
  async function saveAccount() {
    setSaving(true);
    setError(null);
    try {
      // Update profile with new account details
      const { error: err } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          avatar_url: avatarUrl ?? null,
        })
        .eq("user_id", user.id);
      if (err) throw err;

      // Refresh data and show success message
      await refresh();
      flashSuccess("Account updated");
    } catch (e: any) {
      setError(e?.message ?? "Failed to update account.");
    } finally {
      setSaving(false);
    }
  }

  // Function to handle avatar image upload
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // Generate unique path and upload to Supabase storage
      const fileExt = file.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

      // Upload file to Supabase storage
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (upErr) throw upErr;

      // Get public URL of the uploaded avatar
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);

      // Update avatar URL state
      setAvatarUrl(data.publicUrl);
    } catch (e: any) {
      setError(e?.message ?? "Avatar upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Function to send password reset email
  async function sendPasswordReset() {
    try {
      // Trigger password reset email
      await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      alert("Password reset email sent.");
    } catch (e: any) {
      alert(e?.message ?? "Could not send reset email.");
    }
  }

  // Function to log out the user
  async function doLogout() {
    try {
      // Sign out and redirect to login
      await supabase.auth.signOut();
      setTheme("light");
      try { localStorage.setItem("centry-theme", "light"); } catch {}
      
      // Close modal and reset state
      setConfirmLogout(false);
      onOpenChange(false);
      router.replace("/login");
    } catch (e: any) {
      alert(e?.message ?? "Logout failed.");
    }
  }

  // Function to toggle study goals selection
  function toggleGoals(val: string) {
    setStudyGoals((prev) => {
      const has = prev.includes(val);
      
      if (val === Q.GOALS_NONE) {
        return has ? [] : [Q.GOALS_NONE];
      }
    
      // Remove "None" if selecting other goals
      const withoutNone = prev.filter((g) => g !== Q.GOALS_NONE);
      if (has) {
        return withoutNone.filter((g) => g !== val);
      }
      return [...withoutNone, val];
    });
  }

  // Render the settings modal with sections and forms
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[700px] max-w-[95vw] sm:max-w-[1400px] h-[76vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>

          {/* Settings sections */}
          <div className="h-[calc(76vh-64px)] px-4 pb-6 grid grid-cols-[160px_1fr] gap-6">
            <aside className="border-r pr-3">
              <nav className="space-y-2">
                {[
                  { id: "personalization", label: "Personalization" },
                  { id: "theme", label: "Theme" },
                  { id: "account", label: "Account" },
                  { id: "logout", label: "Logout" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSection(item.id as Section)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm",
                      section === item.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </aside>
            {/* Main content area */}
            <main className="overflow-y-auto pr-2">
              <div className="space-y-6">
                {error && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
                    {error}
                  </div>
                )}

                {/* Personalization section */}
                {section === "personalization" && (
                  <section className="space-y-6">
                    
                    <div className="space-y-2">
                      <Label>Education Level</Label> 
                      <Select
                        value={educationLevel ?? ""}
                        onValueChange={(v) => setEducationLevel(v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {EDU.map((e) => (
                            <SelectItem key={e} value={e}>
                              {e}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {educationLevel === Q.EDUCATION_OTHER && (
                        <div className="space-y-1">
                          <Input
                            value={educationLevelOther}
                            onChange={(e) => setEducationLevelOther(e.target.value)}
                            placeholder="Type your education level…"
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Preferred learning style</Label>
                      <Select value={learningStyle} onValueChange={setLearningStyle}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {LEARNING.map((e) => (
                            <SelectItem key={e} value={e}>
                              {e}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Preferred explanation style</Label>
                      <Select value={explainFormat} onValueChange={setExplainFormat}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPLAIN.map((e) => (
                            <SelectItem key={e} value={e}>
                              {e}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Main study goals</Label>
                      <div className="flex flex-col gap-2">
                        {GOALS.map((g) => {
                          const active = studyGoals.includes(g);
                          return (
                            <Button
                              key={g}
                              type="button"
                              variant={active ? "default" : "outline"}
                              className="justify-start"
                              onClick={() => toggleGoals(g)}
                            >
                              {active && <CheckIcon className="mr-2 h-4 w-4" />}
                              {g}
                            </Button>
                          );
                        })}
                      </div>
                      {studyGoals.includes(Q.GOALS_NONE)}
                    </div>

                    <div className="space-y-2">
                      <Label>Preferred response tone</Label>
                      <Select value={tone} onValueChange={setTone}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {TONES.map((e) => (
                            <SelectItem key={e} value={e}>
                              {e}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                      </Button>
                      <Button onClick={savePersonalization} disabled={saving}>
                        Save changes
                      </Button>
                    </div>
                  </section>
                )}

                {/* Theme preference section */}
                {section === "theme" && (
                  <section className="space-y-6">
                    <div className="space-y-2">
                      <Label>Theme</Label>
                      <Select value={themePref} onValueChange={(v: "light" | "dark") => setThemePref(v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select theme…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                      </Button>
                      <Button onClick={saveTheme} disabled={saving}>
                        Save theme
                      </Button>
                    </div>
                  </section>
                )}

                {/* Account details section */}
                {section === "account" && (
                  <section className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="relative w-16 h-16 rounded-full overflow-hidden bg-muted">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          <Image src="/svg/app-logo.svg" alt="avatar" fill className="object-contain p-3 dark:invert" />
                        )}
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="avatar">Account avatar</Label>
                        <div className="mt-2 flex items-center gap-2">
                          <Input id="avatar" type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
                          <Button type="button" variant="secondary" disabled>
                            <UploadIcon className="w-4 h-4 mr-2" />
                            Upload
                          </Button>
                        </div>
                        {uploading && <p className="text-xs text-muted-foreground mt-1">Uploading…</p>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>First name</Label>
                      <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label>Last name</Label>
                      <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>

                    <div className="space-y-1">
                      <Label>Email</Label>
                      <Input value={user.email} disabled />
                      <Button variant="link" className="px-0" onClick={sendPasswordReset}>
                        Reset password
                      </Button>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                      </Button>
                      <Button onClick={saveAccount} disabled={saving}>
                        Save account
                      </Button>
                    </div>
                  </section>
                )}

                {/* Logout section */}
                {section === "logout" && (
                  <section className="space-y-4">
                    <p className="text-sm text-muted-foreground">Log out of your account on this device.</p>
                    <Button variant="destructive" onClick={() => setConfirmLogout(true)}>
                      Logout
                    </Button>
                  </section>
                )}
              </div>
            </main>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm logout dialog */}
      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>You’ll need to sign in again to continue.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doLogout}>Log out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success message dialog */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogOverlay className="bg-transparent" />
        <DialogContent className="w-[320px] p-0 rounded-xl border shadow-lg">
          <DialogTitle className="hidden"></DialogTitle>
          <div className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <CheckIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="font-medium leading-none">Success</p>
              <p className="mt-1 text-sm text-muted-foreground truncate">{successText}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
