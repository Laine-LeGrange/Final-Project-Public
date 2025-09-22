"use client";
// Mark as client component

// Import necessary modules and components
import * as React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import welcomeImage from "@/public/images/login-signup-image.png";

// shadcn dialog
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Signup form component
export function SignupForm({ className, ...props }: React.ComponentProps<"div">) {

  // Hooks and state for form handling and authentication
  const router = useRouter();
  const supabase = React.useMemo(() => supabaseBrowser(), []);

  // Form state
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Modal state for confirmation
  const [showConfirmModal, setShowConfirmModal] = React.useState(false);
  const [resendState, setResendState] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const redirectRef = React.useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (redirectRef.current) clearTimeout(redirectRef.current);
    };
  }, []);

  // Form submission handler
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResendState("idle");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });

    setLoading(false);

    // Handle errors
    if (error) {
      setError(error.message);
      return;
    }

    // If signup is successful, store profile info
    const userId = data.user?.id;
    if (userId) {
      await supabase.from("profiles").upsert({
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
      });
    }

    // Show modal and schedule redirect to login
    setShowConfirmModal(true);
    redirectRef.current = setTimeout(() => {
      router.replace("/login");
    }, 5000);
  };

  // Google OAuth signup handler
  const signupWithGoogle = async () => {
    setLoading(true);
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?flow=signup` },
    });
  };

  // Resend confirmation email handler
  const handleResend = async () => {
    setResendState("sending");
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  };

  // Render the signup form
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm your email</DialogTitle>
            <DialogDescription>
              We’ve sent a confirmation link to <span className="font-medium">{email}</span>. Please confirm your
              account. You’ll be redirected to the login page to sign in once confirmed.
            </DialogDescription>
          </DialogHeader>

          <div className="text-xs text-muted-foreground">
            Didn’t get it? Check spam/promotions or resend the email.
          </div>

          {/* Resend confirmation email button */}
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={handleResend}
              disabled={resendState === "sending" || resendState === "sent"}
              type="button"
            >
              {resendState === "sending"
                ? "Resending…"
                : resendState === "sent"
                ? "Email sent!"
                : resendState === "error"
                ? "Try again"
                : "Resend email"}
            </Button>
            <Button type="button" onClick={() => router.replace("/login")}>
              Go to login now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signup form */}
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={onSubmit}>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold">Create your account</h1>
                <p className="text-balance text-muted-foreground">Let’s get you set up</p>
              </div>

              {error && (
                <p className="text-sm text-red-500" role="alert">
                  {error}
                </p>
              )}

              {/* Name fields */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="grid gap-3">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="grid gap-3">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Email field */}
              <div className="grid gap-3">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              {/* Password field */}
              <div className="grid gap-3">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              {/* Submit button */}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating account…" : "Sign up"}
              </Button>

              <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                <span className="bg-card relative z-10 px-2 text-muted-foreground">Or continue with</span>
              </div>

              {/* Google OAuth button */}
              <div className="grid grid-cols-1 gap-4">
                <Button variant="outline" type="button" className="w-full" onClick={signupWithGoogle} disabled={loading}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 533.5 544.3"
                    className="mr-2 h-4 w-4"
                    aria-hidden
                  >
                    <path
                      fill="currentColor"
                      d="M533.5 278.4c0-18.5-1.7-36.4-4.9-53.6H272.1v101.4h147.1c-6.3 34.1-25.2 62.9-53.7 82.2v68h86.6c50.6-46.6 81.4-115.2 81.4-198z"
                    />
                    <path
                      fill="currentColor"
                      d="M272.1 544.3c72.9 0 134.1-24.2 178.8-65.7l-86.6-68c-24.1 16.2-55 26-92.2 26-70.9 0-131-47.8-152.5-112.1h-89v70.4c44.5 88 136.5 149.4 241.5 149.4z"
                    />
                    <path
                      fill="currentColor"
                      d="M119.6 324.5c-10.1-30.2-10.1-63 0-93.2v-70.4h-89C6.3 208.9 0 242.8 0 278.4s6.3 69.6 30.6 117.5l89-71.4z"
                    />
                    <path
                      fill="currentColor"
                      d="M272.1 107.7c39.6-.6 77.3 14.3 106.1 41.6l79.3-79.3C402.3 26.2 342.3 0 272.1 0 167.1 0 75.1 61.4 30.6 160.9l89 70.4C141.1 155.9 201.2 107.7 272.1 107.7z"
                    />
                  </svg>
                  Continue with Google
                </Button>
              </div>

              {/* Login prompt */}
              <div className="text-center text-sm">
                Already have an account?{" "}
                <a href="/login" className="underline underline-offset-4">
                  Log in
                </a>
              </div>
            </div>
          </form>

          <div className="relative hidden bg-muted md:block">
            <img
              src={welcomeImage.src}
              alt="Image"
              className="absolute dark:invert inset-0 h-full w-full object-cover"
            />
          </div>
        </CardContent>
      </Card>

      {/* Terms of Service and Privacy Policy - not active for this project, as it is not necessary */}
      <div className="text-center text-xs text-balance text-muted-foreground *:[a]:underline *:[a]:underline-offset-4 *:[a]:hover:text-primary">
        By continuing, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
      </div>
    </div>
  );
}
