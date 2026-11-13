"use client";

import * as React from "react";
import Link from "next/link";
import {
  loginAction,
  signupAction,
  type AuthActionState,
} from "@/lib/auth/actions";
import { loginSchema, signupSchema } from "@/lib/auth/schemas";
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

interface AuthFormProps {
  mode: "login" | "signup";
}

const initialState: AuthActionState = {};

export function AuthForm({ mode }: AuthFormProps) {
  const isLogin = mode === "login";
  const serverAction = isLogin ? loginAction : signupAction;

  const [state, formAction, isPending] = React.useActionState(
    serverAction,
    initialState
  );
  const [clientErrors, setClientErrors] = React.useState<
    AuthActionState["fieldErrors"]
  >({});
  const [selectedRole, setSelectedRole] = React.useState<"student" | "teacher">(
    "student"
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const rawData: unknown = isLogin
      ? {
          email: formData.get("email") ?? "",
          password: formData.get("password") ?? "",
        }
      : {
          role: formData.get("role") ?? "",
          displayName: formData.get("displayName") ?? "",
          email: formData.get("email") ?? "",
          password: formData.get("password") ?? "",
          consentAccepted: formData.get("consentAccepted") === "on",
        };

    const schema = isLogin ? loginSchema : signupSchema;
    const parsed = schema.safeParse(rawData);

    if (!parsed.success) {
      event.preventDefault();
      const flattened = parsed.error.flatten().fieldErrors as Record<
        string,
        string[] | undefined
      >;
      setClientErrors({
        role: flattened.role?.[0],
        displayName: flattened.displayName?.[0],
        email: flattened.email?.[0],
        password: flattened.password?.[0],
        consentAccepted: flattened.consentAccepted?.[0],
      });
      return;
    }

    setClientErrors({});
  }

  const roleError = clientErrors?.role ?? state.fieldErrors?.role;
  const displayNameError =
    clientErrors?.displayName ?? state.fieldErrors?.displayName;
  const emailError = clientErrors?.email ?? state.fieldErrors?.email;
  const passwordError = clientErrors?.password ?? state.fieldErrors?.password;
  const consentError =
    clientErrors?.consentAccepted ?? state.fieldErrors?.consentAccepted;

  return (
    <Card className="w-full max-w-md border-slate-200/90 shadow-sm">
      <CardHeader className="space-y-2 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-teal-50 px-3.5 py-1 text-xs font-semibold text-teal-800">
          <span>{vi.app.name}</span>
          <span>•</span>
          <span>
            {isLogin
              ? `${vi.roles.teacherLabel} & ${vi.roles.studentLabel}`
              : selectedRole === "teacher"
                ? vi.roles.teacherLabel
                : vi.roles.studentLabel}
          </span>
        </div>
        <CardTitle className="text-2xl font-bold text-slate-900">
          {isLogin ? vi.auth.loginTitle : vi.auth.signupTitle}
        </CardTitle>
        <CardDescription className="text-sm text-slate-600">
          {isLogin ? vi.auth.loginSubtitle : vi.auth.signupSubtitle}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form
          action={formAction}
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4"
        >
          {state.error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {state.error}
            </div>
          ) : null}

          {state.successMessage ? (
            <div
              role="status"
              className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900"
            >
              {state.successMessage}
            </div>
          ) : null}

          {!isLogin ? (
            <div className="space-y-2">
              <Label>{vi.auth.roleLabel}</Label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {(
                  [
                    [
                      "student",
                      vi.auth.roleStudent,
                      vi.auth.roleStudentDesc,
                    ],
                    [
                      "teacher",
                      vi.auth.roleTeacher,
                      vi.auth.roleTeacherDesc,
                    ],
                  ] as const
                ).map(([roleValue, title, desc]) => {
                  const active = selectedRole === roleValue;
                  return (
                    <label
                      key={roleValue}
                      className={`flex min-h-[44px] cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors ${
                        active
                          ? "border-teal-600 bg-teal-50/70 text-teal-950"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="role"
                          value={roleValue}
                          checked={active}
                          onChange={() => setSelectedRole(roleValue)}
                          className="h-4 w-4 accent-teal-600"
                        />
                        <span className="text-xs font-bold sm:text-sm">
                          {title}
                        </span>
                      </div>
                      <span className="pl-6 text-[11px] leading-snug text-slate-600">
                        {desc}
                      </span>
                    </label>
                  );
                })}
              </div>
              {roleError ? (
                <p className="text-xs font-medium text-red-600">{roleError}</p>
              ) : null}
            </div>
          ) : null}

          {!isLogin ? (
            <div className="space-y-2">
              <Label htmlFor="displayName">{vi.auth.displayNameLabel}</Label>
              <Input
                id="displayName"
                name="displayName"
                type="text"
                autoComplete="name"
                placeholder={vi.auth.displayNamePlaceholder}
                aria-invalid={Boolean(displayNameError)}
                aria-describedby={
                  displayNameError ? "displayName-error" : undefined
                }
              />
              {displayNameError ? (
                <p
                  id="displayName-error"
                  className="text-xs font-medium text-red-600"
                >
                  {displayNameError}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">{vi.auth.emailLabel}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder={vi.auth.emailPlaceholder}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError ? (
              <p id="email-error" className="text-xs font-medium text-red-600">
                {emailError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{vi.auth.passwordLabel}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              placeholder={vi.auth.passwordPlaceholder}
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordError ? "password-error" : undefined}
            />
            {passwordError ? (
              <p
                id="password-error"
                className="text-xs font-medium text-red-600"
              >
                {passwordError}
              </p>
            ) : null}
          </div>

          {!isLogin ? (
            <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-slate-700">
                <input
                  type="checkbox"
                  name="consentAccepted"
                  className="mt-1 h-4 w-4 shrink-0 rounded accent-teal-600"
                />
                <span>
                  {vi.auth.consentPrefix}{" "}
                  <Link
                    href="/terms"
                    target="_blank"
                    className="font-semibold text-teal-700 underline"
                  >
                    {vi.auth.consentTermsLink}
                  </Link>{" "}
                  {vi.auth.consentAndWord}{" "}
                  <Link
                    href="/privacy"
                    target="_blank"
                    className="font-semibold text-teal-700 underline"
                  >
                    {vi.auth.consentPrivacyLink}
                  </Link>
                  .
                </span>
              </label>
              {consentError ? (
                <p className="text-xs font-medium text-red-600">
                  {consentError}
                </p>
              ) : null}
            </div>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={isPending}
            className="w-full"
          >
            {isPending
              ? isLogin
                ? vi.auth.loginSubmitting
                : vi.auth.signupSubmitting
              : isLogin
                ? vi.auth.loginButton
                : vi.auth.signupButton}
          </Button>

          {!isLogin ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-950">
              <p>{vi.auth.kidsAnonymousHint}</p>
              <Link
                href="/study"
                className="mt-1 inline-flex min-h-[36px] items-center font-bold text-teal-800 underline"
              >
                {vi.auth.kidsAnonymousLink}
              </Link>
            </div>
          ) : null}
        </form>
      </CardContent>

      <CardFooter className="justify-center border-t border-slate-100 pt-4 text-sm text-slate-600">
        <span>
          {isLogin ? vi.auth.noAccountPrompt : vi.auth.hasAccountPrompt}
        </span>
        <Link
          href={isLogin ? "/signup" : "/login"}
          className="ml-1.5 inline-flex min-h-[44px] items-center font-semibold text-teal-700 underline-offset-4 hover:underline"
        >
          {isLogin ? vi.auth.noAccountLink : vi.auth.hasAccountLink}
        </Link>
      </CardFooter>
    </Card>
  );
}
