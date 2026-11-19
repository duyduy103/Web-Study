"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClassMemberItem } from "@/lib/classes/schemas";
import type { ClassMemberStatus } from "@/lib/supabase/types";

interface ClassMembersTabProps {
  classId: string;
  initialMembers: ClassMemberItem[];
  maxStudentsPerClass: number;
}

function getStatusLabel(status: ClassMemberStatus): string {
  switch (status) {
    case "active":
      return vi.classes.statusActiveMember;
    case "pending":
      return vi.classes.statusPendingMember;
    case "rejected":
      return vi.classes.statusRejectedMember;
    case "removed":
      return vi.classes.statusRemovedMember;
    case "left":
      return vi.classes.statusLeftMember;
  }
}

function getStatusStyle(status: ClassMemberStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "pending":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "rejected":
    case "removed":
      return "bg-red-50 text-red-700 border-red-200";
    case "left":
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export function ClassMembersTab({
  classId,
  initialMembers,
  maxStudentsPerClass,
}: ClassMembersTabProps) {
  const [members, setMembers] = React.useState<ClassMemberItem[]>(initialMembers);
  const [search, setSearch] = React.useState("");
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null);
  const [removeTarget, setRemoveTarget] =
    React.useState<ClassMemberItem | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const activeCount = members.filter((m) => m.status === "active").length;

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.display_name.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q)
    );
  }, [members, search]);

  const pendingMembers = filtered.filter((m) => m.status === "pending");
  const activeMembers = filtered.filter((m) => m.status === "active");
  const otherMembers = filtered.filter(
    (m) => m.status !== "pending" && m.status !== "active"
  );

  async function handleDecision(
    memberUserId: string,
    action: "approve" | "reject" | "remove"
  ) {
    setBusyUserId(memberUserId);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/classes/${classId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberUserId, action }),
      });
      const data = (await res.json()) as {
        error?: string;
        status?: ClassMemberStatus;
      };
      if (!res.ok) {
        setErrorMsg(data.error ?? vi.classes.errors.systemError);
        return;
      }

      const nextStatus: ClassMemberStatus =
        data.status ??
        (action === "approve"
          ? "active"
          : action === "reject"
            ? "rejected"
            : "removed");

      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === memberUserId
            ? { ...m, status: nextStatus, decided_at: new Date().toISOString() }
            : m
        )
      );
      setRemoveTarget(null);
    } catch {
      setErrorMsg(vi.classes.errors.systemError);
    } finally {
      setBusyUserId(null);
    }
  }

  function renderTable(rows: ClassMemberItem[], title: string) {
    if (rows.length === 0) return null;
    return (
      <div className="space-y-2.5">
        <h3 className="text-sm font-bold text-slate-900">
          {title} ({rows.length})
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">{vi.classes.members.colName}</th>
                <th className="px-4 py-3">{vi.classes.members.colEmail}</th>
                <th className="px-4 py-3">{vi.classes.members.colJoinedAt}</th>
                <th className="px-4 py-3">{vi.classes.members.colStatus}</th>
                <th className="px-4 py-3 text-right">
                  {vi.classes.members.colActions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((m) => {
                const isBusy = busyUserId === m.user_id;
                return (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {m.display_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {m.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(m.joined_at).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusStyle(
                          m.status
                        )}`}
                      >
                        {getStatusLabel(m.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {m.status === "pending" ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              disabled={isBusy}
                              onClick={() =>
                                void handleDecision(m.user_id, "approve")
                              }
                              className="min-h-[44px]"
                            >
                              {vi.classes.members.approveButton}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isBusy}
                              onClick={() =>
                                void handleDecision(m.user_id, "reject")
                              }
                              className="min-h-[44px] border-red-200 text-red-700 hover:bg-red-50"
                            >
                              {vi.classes.members.rejectButton}
                            </Button>
                          </>
                        ) : null}

                        {m.status === "active" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => setRemoveTarget(m)}
                            className="min-h-[44px] border-red-200 text-red-700 hover:bg-red-50"
                          >
                            {vi.classes.members.removeButton}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={vi.classes.members.searchPlaceholder}
          aria-label={vi.classes.members.searchPlaceholder}
          className="min-h-[44px] sm:max-w-sm"
        />
        <p className="text-xs font-medium text-slate-600">
          {vi.classes.members.capacityPrefix}{" "}
          <strong>
            {activeCount}/{maxStudentsPerClass}
          </strong>{" "}
          {vi.classes.statsStudentsUnit}
        </p>
      </div>

      {errorMsg ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {errorMsg}
        </div>
      ) : null}

      {members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          {vi.classes.members.emptyList}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          {vi.classes.members.noSearchMatch}
        </div>
      ) : (
        <div className="space-y-6">
          {renderTable(pendingMembers, vi.classes.members.pendingSectionTitle)}
          {renderTable(activeMembers, vi.classes.members.activeSectionTitle)}
          {renderTable(otherMembers, vi.classes.members.otherSectionTitle)}
        </div>
      )}

      {removeTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              {vi.classes.members.removeButton}
            </h3>
            <p className="text-sm text-slate-700">
              {vi.classes.members.removeConfirmPrefix}{" "}
              <strong>{removeTarget.display_name}</strong>{" "}
              {vi.classes.members.removeConfirmSuffix}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busyUserId === removeTarget.user_id}
                onClick={() => setRemoveTarget(null)}
                className="min-h-[44px]"
              >
                {vi.classes.cancelButton}
              </Button>
              <Button
                type="button"
                disabled={busyUserId === removeTarget.user_id}
                onClick={() =>
                  void handleDecision(removeTarget.user_id, "remove")
                }
                className="min-h-[44px] bg-red-600 text-white hover:bg-red-700"
              >
                {vi.classes.members.removeButton}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

