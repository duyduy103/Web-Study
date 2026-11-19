"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { vi } from "@/lib/i18n/vi";
import { generateQrCodeSvg } from "@/lib/grading/qr-and-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ClassRecordDetail {
  id: string;
  teacher_id: string;
  name: string;
  description: string | null;
  join_code: string;
  require_approval: boolean;
  is_open: boolean;
  archived_at: string | null;
  created_at: string;
}

interface ClassSettingsTabProps {
  classData: ClassRecordDetail;
  appOrigin: string;
  onClassUpdated: (next: ClassRecordDetail) => void;
}

export function ClassSettingsTab({
  classData,
  appOrigin,
  onClassUpdated,
}: ClassSettingsTabProps) {
  const router = useRouter();
  const [name, setName] = React.useState(classData.name);
  const [description, setDescription] = React.useState(
    classData.description ?? ""
  );
  const [isOpen, setIsOpen] = React.useState(classData.is_open);
  const [requireApproval, setRequireApproval] = React.useState(
    classData.require_approval
  );
  const [saving, setSaving] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [copiedType, setCopiedType] = React.useState<"code" | "link" | null>(
    null
  );
  const [notice, setNotice] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const joinPath = `/join/${classData.join_code}`;
  const fullJoinUrl = appOrigin ? `${appOrigin}${joinPath}` : joinPath;

  const qrSvgDataUri = React.useMemo(() => {
    const svg = generateQrCodeSvg(fullJoinUrl);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [fullJoinUrl]);

  async function copyText(text: string, type: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // ignore clipboard fallback
    }
  }

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/classes/${classData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          name,
          description: description.trim() || null,
          isOpen,
          requireApproval,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        class?: ClassRecordDetail;
      };
      if (!res.ok) {
        setErrorMsg(data.error ?? vi.classes.errors.systemError);
        return;
      }
      if (data.class) {
        onClassUpdated(data.class);
      }
      setNotice(vi.classes.savedNotice);
      router.refresh();
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateCode() {
    if (!window.confirm(vi.classes.settings.regenerateConfirm)) return;
    setRegenerating(true);
    setNotice(null);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/classes/${classData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate_code" }),
      });
      const data = (await res.json()) as {
        error?: string;
        class?: ClassRecordDetail;
      };
      if (!res.ok) {
        setErrorMsg(data.error ?? vi.classes.errors.systemError);
        return;
      }
      if (data.class) {
        onClassUpdated(data.class);
      }
      setNotice(vi.classes.savedNotice);
      router.refresh();
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleToggleArchive() {
    setArchiving(true);
    setNotice(null);
    setErrorMsg(null);
    try {
      const action = classData.archived_at ? "unarchive" : "archive";
      const res = await fetch(`/api/classes/${classData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        error?: string;
        class?: ClassRecordDetail;
      };
      if (!res.ok) {
        setErrorMsg(data.error ?? vi.classes.errors.systemError);
        return;
      }
      if (data.class) {
        onClassUpdated(data.class);
      }
      setNotice(vi.classes.savedNotice);
      router.refresh();
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setArchiving(false);
    }
  }

  async function handleDeleteClass() {
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/classes/${classData.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? vi.classes.errors.systemError);
        return;
      }
      router.push("/dashboard/classes");
      router.refresh();
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          {notice}
        </div>
      ) : null}

      {errorMsg ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {errorMsg}
        </div>
      ) : null}

      {/* Mã tham gia, link & QR */}
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900">
            {vi.classes.settings.inviteTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_180px] md:items-center">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{vi.classes.settings.joinCodeLabel}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 font-mono text-2xl font-black tracking-[0.2em] text-teal-900">
                  {classData.join_code}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyText(classData.join_code, "code")}
                  className="min-h-[44px]"
                >
                  {copiedType === "code"
                    ? vi.classes.settings.copiedButton
                    : vi.classes.settings.copyCodeButton}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={regenerating}
                  onClick={() => void handleRegenerateCode()}
                  className="min-h-[44px]"
                >
                  {vi.classes.settings.regenerateCodeButton}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{vi.classes.settings.joinLinkLabel}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  readOnly
                  value={fullJoinUrl}
                  className="min-h-[44px] flex-1 bg-slate-50 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyText(fullJoinUrl, "link")}
                  className="min-h-[44px]"
                >
                  {copiedType === "link"
                    ? vi.classes.settings.copiedButton
                    : vi.classes.settings.copyLinkButton}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSvgDataUri}
              alt={`Mã QR vào lớp ${classData.name}`}
              className="h-36 w-36 rounded-lg bg-white p-1"
            />
            <p className="mt-2 text-[11px] leading-snug text-slate-600">
              {vi.classes.settings.qrCaption}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Thông tin & quyền tham gia */}
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900">
            {vi.classes.settings.infoTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveInfo} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-class-name">
                {vi.classes.classNameLabel}
              </Label>
              <Input
                id="edit-class-name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-h-[44px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-class-desc">
                {vi.classes.classDescLabel}
              </Label>
              <textarea
                id="edit-class-desc"
                rows={3}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={isOpen}
                  onChange={(e) => setIsOpen(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                <span className="text-xs leading-relaxed text-slate-700">
                  <strong className="block text-sm text-slate-900">
                    {vi.classes.settings.isOpenLabel}
                  </strong>
                  {vi.classes.settings.isOpenHint}
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={requireApproval}
                  onChange={(e) => setRequireApproval(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600"
                />
                <span className="text-xs leading-relaxed text-slate-700">
                  <strong className="block text-sm text-slate-900">
                    {vi.classes.requireApprovalLabel}
                  </strong>
                  {vi.classes.requireApprovalHint}
                </span>
              </label>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saving || name.trim().length === 0}
                className="min-h-[44px]"
              >
                {saving ? vi.classes.savingButton : vi.classes.saveButton}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Lưu trữ & Xóa lớp */}
      <Card className="border-red-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-900">
            {vi.classes.settings.archiveTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-600">
            {vi.classes.settings.archiveHint}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={archiving}
              onClick={() => void handleToggleArchive()}
              className="min-h-[44px]"
            >
              {classData.archived_at
                ? vi.classes.settings.unarchiveButton
                : vi.classes.settings.archiveButton}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(true)}
              className="min-h-[44px] border-red-300 text-red-700 hover:bg-red-50"
            >
              {vi.classes.settings.deleteButton}
            </Button>
          </div>
        </CardContent>
      </Card>

      {deleteDialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-red-800">
              {vi.classes.settings.deleteConfirmTitle}
            </h3>
            <p className="text-sm leading-relaxed text-slate-700">
              {vi.classes.settings.deleteConfirmDesc}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => setDeleteDialogOpen(false)}
                className="min-h-[44px]"
              >
                {vi.classes.cancelButton}
              </Button>
              <Button
                type="button"
                disabled={deleting}
                onClick={() => void handleDeleteClass()}
                className="min-h-[44px] bg-red-600 text-white hover:bg-red-700"
              >
                {vi.classes.settings.confirmDeleteButton}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

