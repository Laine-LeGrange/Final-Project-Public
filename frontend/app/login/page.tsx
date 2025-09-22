// Import the LoginForm component
import { LoginForm } from "@/components/forms//login-form";

// Login page component
export default function LoginPage() {
  return (
    // Full-screen centered container
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-3xl">
        <LoginForm />
      </div>
    </div>
  );
}
