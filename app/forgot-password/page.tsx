"use client";

import * as React from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/lib/auth/actions";
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

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = React.useActionState(
    forgotPasswordAction,
    {}
  );
  const [email, setEmail] = React.useState("");

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md border-slate-200/90 shadow-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-teal-50 px-3.5 py-1 text-xs font-semibold text-teal-800">
            <span>{vi.app.name}</span>
            <span>•</span>
            <span>{vi.auth.forgotPassword.title}</span>
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">
            {vi.auth.forgotPassword.title}
          </CardTitle>
          <CardDescription className="text-sm text-slate-600">
            {vi.auth.forgotPassword.subtitle}
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
                {vi.auth.forgotPassword.successTitle}
              </h3>
              <p className="text-xs leading-relaxed text-teal-800">
                {state.message ?? vi.auth.forgotPassword.successDesc}
              </p>
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

              <div className="space-y-2">
                <Label htmlFor="email">{vi.auth.forgotPassword.emailLabel}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={vi.auth.forgotPassword.emailPlaceholder}
                />
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isPending}
                className="w-full"
              >
                {isPending
                  ? vi.auth.forgotPassword.submittingButton
                  : vi.auth.forgotPassword.submitButton}
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

