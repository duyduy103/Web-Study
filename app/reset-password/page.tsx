"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resetPasswordAction } from "@/lib/auth/actions";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PasswordStrengthMeter } from "@/components/features/auth/password-strength-meter";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, formAction, isPending] = React.useActionState(
    resetPasswordAction,
    {}
  );
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  React.useEffect(() => {
    if (state.success) {
      const timer = setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.success, router]);

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md border-slate-200/90 shadow-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-teal-50 px-3.5 py-1 text-xs font-semibold text-teal-800">
            <span>{vi.app.name}</span>
            <span>•</span>
            <span>{vi.auth.resetPassword.title}</span>
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">
            {vi.auth.resetPassword.title}
          </CardTitle>
          <CardDescription className="text-sm text-slate-600">
            {vi.auth.resetPassword.subtitle}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {state.success ? (
            <div
              role="status"
              aria-live="polite"
              className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-center"
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-700 font-bold">
                ✓
              </div>
              <h3 className="font-bold text-teal-900">
                {vi.auth.resetPassword.successMessage}
              </h3>
            </div>
          ) : (
            <form action={formAction} className="space-y-4" noValidate>
              {state.error ? (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  {state.error}
                </div>
              ) : null}

              {/* Mật khẩu mới */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">
                    {vi.auth.resetPassword.newPasswordLabel}
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? vi.auth.hidePassword : vi.auth.showPassword}
                    className="inline-flex min-h-[36px] items-center rounded-md px-1 text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1"
                  >
                    {showPassword ? vi.auth.hidePassword : vi.auth.showPassword}
                  </button>
                </div>
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={vi.auth.resetPassword.newPasswordPlaceholder}
                  aria-invalid={Boolean(state.fieldErrors?.password)}
                />
                {state.fieldErrors?.password ? (
                  <p className="text-xs font-medium text-red-600">
                    {state.fieldErrors.password}
                  </p>
                ) : null}
              </div>

              {/* Password strength meter */}
              <PasswordStrengthMeter password={password} />

              {/* Nhập lại mật khẩu mới */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="confirmPassword">
                    {vi.auth.resetPassword.confirmNewPasswordLabel}
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={
                      showConfirmPassword
                        ? vi.auth.hidePassword
                        : vi.auth.showPassword
                    }
                    className="inline-flex min-h-[36px] items-center rounded-md px-1 text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1"
                  >
                    {showConfirmPassword
                      ? vi.auth.hidePassword
                      : vi.auth.showPassword}
                  </button>
                </div>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={
                    vi.auth.resetPassword.confirmNewPasswordPlaceholder
                  }
                  aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
                />
                {state.fieldErrors?.confirmPassword ? (
                  <p className="text-xs font-medium text-red-600">
                    {state.fieldErrors.confirmPassword}
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isPending}
                className="w-full"
              >
                {isPending
                  ? vi.auth.resetPassword.submittingButton
                  : vi.auth.resetPassword.submitButton}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="justify-center border-t border-slate-100 pt-4 text-sm text-slate-600">
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center font-semibold text-teal-700 underline-offset-4 hover:underline"
          >
            ← {vi.auth.forgotPassword.backToLogin}
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}

