import { AuthForm } from "@/components/features/auth/auth-form";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:px-6">
      <AuthForm mode="signup" />
    </main>
  );
}

