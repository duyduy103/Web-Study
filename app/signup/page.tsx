import { AuthForm } from "@/components/features/auth/auth-form";
import { sanitizeNextRedirectPath } from "@/lib/classes/constants";

export default async function SignupPage(props: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const sp = props.searchParams ? await props.searchParams : {};
  const nextPath = sanitizeNextRedirectPath(sp.next, "/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:px-6">
      <AuthForm mode="signup" nextPath={nextPath} />
    </main>
  );
}
