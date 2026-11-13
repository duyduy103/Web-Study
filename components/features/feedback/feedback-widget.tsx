"use client";

import * as React from "react";
import Link from "next/link";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FeedbackType } from "@/lib/supabase/types";

interface FeedbackWidgetProps {
  userEmail?: string | null;
  userRole?: string | null;
  isLoggedIn?: boolean;
}

export function FeedbackWidget({
  userEmail,
  userRole,
  isLoggedIn = false,
}: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [type, setType] = React.useState<FeedbackType>("bug");
  const [content, setContent] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState(userEmail ?? "");
  const [websiteHp, setWebsiteHp] = React.useState(""); // honeypot
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmed = content.trim();
    if (trimmed.length < 10) {
      setErrorMsg(vi.feedback.minLengthError);
      return;
    }
    if (trimmed.length > 2000) {
      setErrorMsg(vi.feedback.maxLengthError);
      return;
    }
    if (!isLoggedIn && (!contactEmail || !contactEmail.includes("@"))) {
      setErrorMsg(vi.feedback.emailRequiredError);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          content: trimmed,
          contact_email: contactEmail.trim(),
          context_meta: {
            url: typeof window !== "undefined" ? window.location.href : "",
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
            role: userRole ?? (isLoggedIn ? "user" : "guest"),
          },
          website_hp: websiteHp,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gửi góp ý thất bại");
      }

      setSuccessMsg(vi.feedback.successMessage);
      setContent("");
      setTimeout(() => {
        setIsOpen(false);
        setSuccessMsg(null);
      }, 2500);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Đã có lỗi xảy ra khi gửi góp ý."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Nút nổi Góp ý ở góc dưới bên phải */}
      <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={vi.feedback.floatingButton}
          className="flex min-h-[44px] items-center gap-2 rounded-full border-2 border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:transform-none"
        >
          <span aria-hidden="true" className="text-base">💬</span>
          <span>{vi.feedback.floatingButton}</span>
        </button>
      </div>

      {/* Modal góp ý */}
      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
        >
          <div className="relative w-full max-w-lg rounded-3xl border border-[var(--space-border)] bg-[var(--space-surface)] p-6 shadow-2xl sm:p-7 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Đóng"
            >
              ✕
            </button>

            <div className="space-y-1 pr-6">
              <h2
                id="feedback-dialog-title"
                className="text-xl font-black text-[var(--heading)] sm:text-2xl"
              >
                {vi.feedback.modalTitle}
              </h2>
              <p className="text-xs text-[var(--muted)]">
                {vi.feedback.modalSubtitle}
              </p>
            </div>

            {successMsg ? (
              <div
                role="status"
                className="my-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-900"
              >
                🎉 {successMsg}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                {/* Honeypot field (ẩn với người, bẫy bot spam) */}
                <input
                  type="text"
                  name="website_hp"
                  value={websiteHp}
                  onChange={(e) => setWebsiteHp(e.target.value)}
                  style={{ display: "none" }}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                />

                <div className="space-y-1.5">
                  <Label htmlFor="feedback-type" className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    {vi.feedback.typeLabel}
                  </Label>
                  <select
                    id="feedback-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as FeedbackType)}
                    className="w-full min-h-[44px] rounded-xl border border-[var(--space-border)] bg-[var(--space-surface)] px-3 py-2 text-sm font-medium text-[var(--foreground)] focus:border-[var(--space-primary)] focus:outline-none"
                  >
                    <option value="bug">{vi.feedback.types.bug}</option>
                    <option value="idea">{vi.feedback.types.idea}</option>
                    <option value="question">{vi.feedback.types.question}</option>
                    <option value="upgrade_request">
                      {vi.feedback.types.upgrade_request}
                    </option>
                    <option value="other">{vi.feedback.types.other}</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="feedback-content" className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                      {vi.feedback.contentLabel}
                    </Label>
                    <span
                      className={`text-[11px] font-semibold ${
                        content.length > 2000
                          ? "text-red-600 font-bold"
                          : content.length >= 10
                          ? "text-emerald-700"
                          : "text-slate-400"
                      }`}
                    >
                      {content.length}/2000
                    </span>
                  </div>
                  <textarea
                    id="feedback-content"
                    required
                    rows={4}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={vi.feedback.contentPlaceholder}
                    className="w-full rounded-2xl border border-[var(--space-border)] bg-[var(--space-surface)] p-3 text-sm text-[var(--foreground)] placeholder:text-slate-400 focus:border-[var(--space-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--space-primary)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="feedback-email" className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    {vi.feedback.emailLabel}
                  </Label>
                  <Input
                    id="feedback-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder={vi.feedback.emailPlaceholder}
                    required={!isLoggedIn}
                    className="min-h-[44px]"
                  />
                  <p className="text-[11px] text-[var(--muted)]">
                    {isLoggedIn
                      ? vi.feedback.emailHelpUser
                      : vi.feedback.emailHelpGuest}
                  </p>
                </div>

                {errorMsg ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
                  >
                    ⚠️ {errorMsg}
                  </div>
                ) : null}

                <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:items-center sm:justify-between">
                  {isLoggedIn ? (
                    <Link
                      href="/dashboard/feedback"
                      onClick={() => setIsOpen(false)}
                      className="text-xs font-bold text-[var(--space-primary)] hover:underline py-1"
                    >
                      📋 {vi.feedback.myFeedbackTitle} →
                    </Link>
                  ) : (
                    <span className="text-[11px] text-[var(--muted)]">
                      {vi.feedback.guestNotice}
                    </span>
                  )}

                  <div className="flex items-center gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsOpen(false)}
                      disabled={loading}
                    >
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      variant="accent"
                      disabled={loading || content.trim().length < 10}
                    >
                      {loading ? vi.feedback.submitting : vi.feedback.submitButton}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

