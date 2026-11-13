"use client";

import * as React from "react";
import Link from "next/link";
import {
  loginAction,
  signupAction,
  resendConfirmationEmailAction,
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
import { PasswordStrengthMeter } from "@/components/features/auth/password-strength-meter";

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

  // Controlled input states to preserve values across error responses
  const [selectedRole, setSelectedRole] = React.useState<"student" | "teacher">(
    "student"
  );
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [consentAccepted, setConsentAccepted] = React.useState(false);

  // Show / Hide password toggles
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  // Dedicated email confirmation screen state
  const [showVerificationScreen, setShowVerificationScreen] =
    React.useState(false);
  const [targetEmail, setTargetEmail] = React.useState("");
  const [countdown, setCountdown] = React.useState(0);
  const [resendStatus, setResendStatus] = React.useState<{
    loading: boolean;
    success?: boolean;
    error?: string;
  }>({ loading: false });

  // Refs for auto-focusing on error
  const emailInputRef = React.useRef<HTMLInputElement | null>(null);
  const passwordInputRef = React.useRef<HTMLInputElement | null>(null);
  const confirmPasswordInputRef = React.useRef<HTMLInputElement | null>(null);
  const displayNameInputRef = React.useRef<HTMLInputElement | null>(null);
  const consentInputRef = React.useRef<HTMLInputElement | null>(null);

  // Đồng bộ giá trị trả về từ server action khi có lỗi
  React.useEffect(() => {
    if (state.values) {
      if (state.values.email !== undefined) setEmail(state.values.email);
      if (state.values.displayName !== undefined)
        setDisplayName(state.values.displayName);
      if (state.values.role !== undefined) setSelectedRole(state.values.role);
      if (state.values.consentAccepted !== undefined)
        setConsentAccepted(state.values.consentAccepted);
    }

    // Luôn xóa mật khẩu khi có lỗi xác thực để bảo đảm an toàn
    setPassword("");
    setConfirmPassword("");

    // Khi đăng ký thành công (hoặc cần xác nhận email), chuyển sang màn hình "Kiểm tra email"
    if (state.unconfirmedEmail || (state.successMessage && !isLogin)) {
      setTargetEmail(state.unconfirmedEmail || email);
      setShowVerificationScreen(true);
      setCountdown(60);
      return;
    }

    // Auto-focus ô lỗi đầu tiên
    const errs = state.fieldErrors;
    if (errs) {
      if (errs.email && emailInputRef.current) {
        emailInputRef.current.focus();
      } else if (errs.password && passwordInputRef.current) {
        passwordInputRef.current.focus();
      } else if (errs.confirmPassword && confirmPasswordInputRef.current) {
        confirmPasswordInputRef.current.focus();
      } else if (errs.displayName && displayNameInputRef.current) {
        displayNameInputRef.current.focus();
      } else if (errs.consentAccepted && consentInputRef.current) {
        consentInputRef.current.focus();
      }
    } else if (state.error && isLogin) {
      // Đăng nhập sai: focus vào ô mật khẩu
      if (passwordInputRef.current) {
        passwordInputRef.current.focus();
      }
    }
  }, [state, isLogin, email]);

  // Bộ đếm ngược 60 giây gửi lại email xác nhận
  React.useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Xử lý gửi lại email xác nhận
  async function handleResendEmail(emailToResend?: string) {
    const target = (emailToResend || targetEmail || email).trim();
    if (!target) return;

    setResendStatus({ loading: true });
    const res = await resendConfirmationEmailAction(target);
    if (res.success) {
      setResendStatus({ loading: false, success: true });
      setCountdown(60);
    } else {
      setResendStatus({
        loading: false,
        error: res.error || vi.auth.errors.generic,
      });
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const rawData = isLogin
      ? { email, password }
      : {
          role: selectedRole,
          displayName,
          email,
          password,
          confirmPassword,
          consentAccepted,
        };

    const schema = isLogin ? loginSchema : signupSchema;
    const parsed = schema.safeParse(rawData);

    if (!parsed.success) {
      event.preventDefault();
      const flattened = parsed.error.flatten().fieldErrors as Record<
        string,
        string[] | undefined
      >;
      const newErrors = {
        role: flattened.role?.[0],
        displayName: flattened.displayName?.[0],
        email: flattened.email?.[0],
        password: flattened.password?.[0],
        confirmPassword: flattened.confirmPassword?.[0],
        consentAccepted: flattened.consentAccepted?.[0],
      };
      setClientErrors(newErrors);

      // Focus ô đầu tiên bị lỗi ở client
      if (newErrors.email && emailInputRef.current) {
        emailInputRef.current.focus();
      } else if (newErrors.password && passwordInputRef.current) {
        passwordInputRef.current.focus();
      } else if (newErrors.confirmPassword && confirmPasswordInputRef.current) {
        confirmPasswordInputRef.current.focus();
      } else if (newErrors.displayName && displayNameInputRef.current) {
        displayNameInputRef.current.focus();
      } else if (newErrors.consentAccepted && consentInputRef.current) {
        consentInputRef.current.focus();
      }
      return;
    }

    setClientErrors({});
  }

  const roleError = clientErrors?.role ?? state.fieldErrors?.role;
  const displayNameError =
    clientErrors?.displayName ?? state.fieldErrors?.displayName;
  const emailError = clientErrors?.email ?? state.fieldErrors?.email;
  const passwordError = clientErrors?.password ?? state.fieldErrors?.password;
  const confirmPasswordError =
    clientErrors?.confirmPassword ?? state.fieldErrors?.confirmPassword;
  const consentError =
    clientErrors?.consentAccepted ?? state.fieldErrors?.consentAccepted;

  // 1. Màn hình riêng "Kiểm tra email của bạn" sau khi đăng ký
  if (showVerificationScreen) {
    return (
      <Card className="w-full max-w-md border-slate-200/90 shadow-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-800 text-xl font-bold">
            ✉
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">
            {vi.auth.checkEmail.title}
          </CardTitle>
          <CardDescription className="text-sm text-slate-600">
            {vi.auth.checkEmail.sentToPrefix}
          </CardDescription>
          <p className="font-semibold text-slate-900 text-base">{targetEmail}</p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-relaxed text-amber-950">
            {vi.auth.checkEmail.spamHint}
          </div>

          {resendStatus.success ? (
            <div
              role="status"
              className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-medium text-teal-800 text-center"
            >
              {vi.auth.checkEmail.resendSuccess}
            </div>
          ) : null}

          {resendStatus.error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800 text-center"
            >
              {resendStatus.error}
            </div>
          ) : null}

          <Button
            type="button"
            variant="outline"
            disabled={countdown > 0 || resendStatus.loading}
            onClick={() => handleResendEmail()}
            className="w-full min-h-[44px]"
          >
            {resendStatus.loading
              ? vi.auth.checkEmail.resending
              : countdown > 0
                ? vi.auth.checkEmail.resendCountdown.replace(
                    "{seconds}",
                    String(countdown)
                  )
                : vi.auth.checkEmail.resendButton}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setShowVerificationScreen(false);
              setTargetEmail("");
            }}
            className="w-full text-slate-600 hover:text-slate-900"
          >
            ← {vi.auth.checkEmail.useAnotherEmailButton}
          </Button>
        </CardContent>

        <CardFooter className="justify-center border-t border-slate-100 pt-4 text-sm text-slate-600">
          <Link
            href="/login"
            className="font-semibold text-teal-700 underline-offset-4 hover:underline"
          >
            {vi.auth.hasAccountLink} →
          </Link>
        </CardFooter>
      </Card>
    );
  }

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
        {/* Banner: Email đã đăng ký */}
        {state.emailAlreadyRegistered ? (
          <div
            role="alert"
            aria-live="polite"
            className="mb-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4"
          >
            <div className="flex items-start gap-2.5">
              <span className="text-lg">⚠️</span>
              <div>
                <h4 className="font-bold text-amber-950 text-sm">
                  {vi.auth.alreadyRegisteredAlert.title}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-amber-900">
                  {vi.auth.alreadyRegisteredAlert.description}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href="/login"
                className="inline-flex min-h-[38px] items-center justify-center rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800"
              >
                {vi.auth.alreadyRegisteredAlert.loginNowButton}
              </Link>
              <Link
                href="/forgot-password"
                className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {vi.auth.alreadyRegisteredAlert.forgotPasswordButton}
              </Link>
            </div>
          </div>
        ) : null}

        {/* Thông báo email chưa xác nhận khi đăng nhập */}
        {state.needsEmailConfirmation ? (
          <div
            role="alert"
            aria-live="polite"
            className="mb-4 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
          >
            <p>{state.error}</p>
            {state.unconfirmedEmail ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={countdown > 0 || resendStatus.loading}
                onClick={() => handleResendEmail(state.unconfirmedEmail)}
                className="w-full mt-1 border-amber-300 bg-white"
              >
                {resendStatus.loading
                  ? vi.auth.checkEmail.resending
                  : countdown > 0
                    ? vi.auth.checkEmail.resendCountdown.replace(
                        "{seconds}",
                        String(countdown)
                      )
                    : vi.auth.resendConfirmationButton}
              </Button>
            ) : null}
            {resendStatus.success ? (
              <p className="text-emerald-700 font-medium">
                {vi.auth.checkEmail.resendSuccess}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Thông báo lỗi chung có aria-live */}
        {state.error && !state.emailAlreadyRegistered && !state.needsEmailConfirmation ? (
          <div
            role="alert"
            aria-live="polite"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {state.error}
          </div>
        ) : null}

        <form
          action={formAction}
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4"
        >
          {/* Lựa chọn vai trò (chỉ ở đăng ký) */}
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

          {/* Tên hiển thị (chỉ ở đăng ký) */}
          {!isLogin ? (
            <div className="space-y-2">
              <Label htmlFor="displayName">{vi.auth.displayNameLabel}</Label>
              <Input
                ref={displayNameInputRef}
                id="displayName"
                name="displayName"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
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

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">{vi.auth.emailLabel}</Label>
            <Input
              ref={emailInputRef}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

          {/* Mật khẩu */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{vi.auth.passwordLabel}</Label>
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
              ref={passwordInputRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

          {/* Real-time password strength meter khi đăng ký */}
          {!isLogin ? (
            <PasswordStrengthMeter password={password} email={email} />
          ) : null}

          {/* Nhập lại mật khẩu (chỉ ở đăng ký) */}
          {!isLogin ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="confirmPassword">
                  {vi.auth.confirmPasswordLabel}
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
                ref={confirmPasswordInputRef}
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={vi.auth.confirmPasswordPlaceholder}
                aria-invalid={Boolean(confirmPasswordError)}
                aria-describedby={
                  confirmPasswordError ? "confirmPassword-error" : undefined
                }
              />
              {confirmPasswordError ? (
                <p
                  id="confirmPassword-error"
                  className="text-xs font-medium text-red-600"
                >
                  {confirmPasswordError}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Quên mật khẩu link khi đăng nhập */}
          {isLogin ? (
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="inline-flex min-h-[36px] items-center rounded-md px-1 text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1"
              >
                {vi.auth.forgotPasswordLink}
              </Link>
            </div>
          ) : null}

          {/* Đồng ý điều khoản (chỉ ở đăng ký) */}
          {!isLogin ? (
            <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-slate-700">
                <input
                  ref={consentInputRef}
                  type="checkbox"
                  name="consentAccepted"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
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
            className="w-full min-h-[44px]"
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
