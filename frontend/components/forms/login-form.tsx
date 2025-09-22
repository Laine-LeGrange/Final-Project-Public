"use client";
// Mark as client component

// Import necessary modules and components
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import welcomeImage from "@/public/images/login-signup-image.png";


// Login form component
export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {

  // Hooks and state for form handling and authentication
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirectedFrom") || "/dashboard";
  const supabase = React.useMemo(() => supabaseBrowser(), []);

  // Form state
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Form submission handler
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Set auth cookies
    const access_token = data.session?.access_token;
    const refresh_token = data.session?.refresh_token;

    // If tokens are available, set them in cookies
    if (access_token && refresh_token) {
      await fetch("/auth/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token, refresh_token }),
        credentials: "include",
      });
    }

    // Check if user has completed onboarding (user preferences)
    const userId = data.user?.id;
    if (!userId) {
     
      router.replace("/login");
      return;
    }

    // Query user preferences
    const { data: prefsRow, error: prefsErr } = await supabase
      .from("user_preferences")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    // Handle potential error
    if (prefsErr) {
      setError(prefsErr.message);
      return;
    }

    // Redirect based on whether onboarding is complete
    if (!prefsRow) {
      router.replace("/onboarding");
    } else {
      router.replace(redirectTo);
    }
  };

  // Google OAuth login handler
  const loginWithGoogle = async () => {
    setLoading(true);
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?flow=login`,
      },
    });
  };

  // Forgot password handler
  const forgotPassword = async () => {
    if (!email) return setError("Enter your email above before resetting.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    });
    if (error) setError(error.message);
    else setError("Password reset link sent.");
  };

  // Render the login form
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={onSubmit}>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold">Welcome back</h1>
                <p className="text-muted-foreground text-balance">Log in to your account</p>
              </div>

              {error && (
                <p className="text-sm text-red-500" role="alert">
                  {error}
                </p>
              )}

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
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={forgotPassword}
                    className="ml-auto text-sm underline-offset-2 hover:underline"
                    disabled={loading}
                  >
                    Forgot your password?
                  </button>
                </div>
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
                {loading ? "Signing in…" : "Login"}
              </Button>

              {/* Divider with "Or continue with" */}
              <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                <span className="bg-card text-muted-foreground relative z-10 px-2">Or continue with</span>
              </div>

              {/* Google OAuth button */}
              <div className="grid grid-cols-1 gap-4">
                <Button variant="outline" type="button" className="w-full" onClick={loginWithGoogle} disabled={loading}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 533.5 544.3" className="mr-2 h-4 w-4" aria-hidden>
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

              {/* Sign up link */}
              <div className="text-center text-sm">
                Don&apos;t have an account?{" "}
                <a href="/signup" className="underline underline-offset-4">
                  Sign up
                </a>
              </div>
            </div>
          </form>

          {/* Welcome image */}
          <div className="bg-muted relative hidden md:block">
            <img
              src={welcomeImage.src}
              alt="Image"
              className="absolute inset-0 h-full dark:invert w-full object-cover"
            />
          </div>
        </CardContent>
      </Card>

      <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
        By continuing, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
      </div>
    </div>
  );
}
