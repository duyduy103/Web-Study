"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AdminUserItem {
  id: string;
  email: string | null;
  display_name: string;
  role: "teacher" | "student";
  created_at: string;
  last_seen_at: string | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  blocked_at: string | null;
  custom_ai_daily_limit: number | null;
  is_admin: boolean;
  set_count: number;
  ai_today_calls: number;
  feedback_count: number;
}

export function AdminUsersWorkspace({
  initialUsers,
  initialTotal,
  currentAdminId,
}: {
  initialUsers: AdminUserItem[];
  initialTotal: number;
  currentAdminId: string;
}) {
  const [users, setUsers] = React.useState<AdminUserItem[]>(initialUsers);
  const [total, setTotal] = React.useState(initialTotal);
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [loading, setLoading] = React.useState(false);

  // Dialog action state
  const [activeModalUser, setActiveModalUser] = React.useState<AdminUserItem | null>(null);
  const [modalAction, setModalAction] = React.useState<
    "block" | "unblock" | "reset_ai" | "custom_ai" | "delete" | null
  >(null);
  const [actionReason, setActionReason] = React.useState("");
  const [customAiLimitInput, setCustomAiLimitInput] = React.useState<number>(50);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const fetchUsers = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        role: roleFilter,
        status: statusFilter,
        limit: "50",
        offset: "0",
      });
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data) {
        setUsers(data.users ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      // Bỏ qua lỗi mạng
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  const handleExecuteAction = async () => {
    if (!activeModalUser || !modalAction) return;

    setActionLoading(true);
    setActionError(null);

    let apiAction = "";
    if (modalAction === "block") apiAction = "block";
    else if (modalAction === "unblock") apiAction = "unblock";
    else if (modalAction === "reset_ai") apiAction = "reset_ai_quota";
    else if (modalAction === "custom_ai") apiAction = "set_custom_ai_limit";
    else if (modalAction === "delete") apiAction = "delete_user";

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_user_id: activeModalUser.id,
          action: apiAction,
          reason: actionReason,
          custom_limit: modalAction === "custom_ai" ? customAiLimitInput : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Thao tác thất bại");
      }

      // Đóng modal và tải lại dữ liệu
      setActiveModalUser(null);
      setModalAction(null);
      setActionReason("");
      await fetchUsers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white sm:text-3xl">
          {vi.admin.usersTitle}
        </h1>
        <p className="mt-0.5 text-xs text-slate-400">
          {vi.admin.usersSubtitle} ({total} tài khoản)
        </p>
      </div>

      {/* Thanh tìm kiếm & Bộ lọc */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={vi.admin.users.searchPlaceholder}
            className="w-full sm:w-72 bg-slate-900 border-slate-800 text-white placeholder:text-slate-500 h-9 text-xs"
          />

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 focus:outline-none"
          >
            <option value="all">{vi.admin.users.filterRoleAll}</option>
            <option value="teacher">Giáo viên</option>
            <option value="student">Học sinh</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 focus:outline-none"
          >
            <option value="all">{vi.admin.users.filterStatusAll}</option>
            <option value="active">{vi.admin.users.statusActive}</option>
            <option value="blocked">{vi.admin.users.statusBlocked}</option>
          </select>
        </div>
      </div>

      {/* Bảng danh sách người dùng */}
      <div className="rounded-3xl border border-slate-800 bg-slate-950 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">{vi.admin.users.colUser}</th>
                <th className="py-3 px-4">{vi.admin.users.colRole}</th>
                <th className="py-3 px-4">{vi.admin.users.colUsage}</th>
                <th className="py-3 px-4">{vi.admin.users.colLastSeen}</th>
                <th className="py-3 px-4">{vi.admin.users.colStatus}</th>
                <th className="py-3 px-4 text-right">{vi.admin.users.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {users.map((u) => {
                const isSelf = u.id === currentAdminId;
                const canModify = !isSelf && !u.is_admin;

                return (
                  <tr
                    key={u.id}
                    className="hover:bg-slate-900/40 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <span>{u.display_name}</span>
                            {u.is_admin ? (
                              <span className="rounded bg-teal-900/80 border border-teal-500 text-[10px] font-black text-teal-300 px-1.5 py-0.2">
                                ADMIN
                              </span>
                            ) : null}
                            {isSelf ? (
                              <span className="text-[10px] text-slate-400 italic">
                                (Bạn)
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {u.email || "—"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                          u.role === "teacher"
                            ? "bg-sky-950 text-sky-400 border border-sky-800"
                            : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        }`}
                      >
                        {u.role === "teacher" ? "Giáo viên" : "Học sinh"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-300">
                      <div className="space-y-0.5">
                        <div>📚 {u.set_count} bộ câu hỏi</div>
                        <div>
                          🤖 AI hôm nay:{" "}
                          <span className="font-bold text-teal-400">
                            {u.ai_today_calls}
                          </span>
                          {u.custom_ai_daily_limit !== null ? (
                            <span className="text-[10px] text-amber-400 ml-1">
                              (riêng: {u.custom_ai_daily_limit}/ngày)
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400">
                      {u.last_seen_at ? (
                        <span>
                          {new Date(u.last_seen_at).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      ) : (
                        <span className="italic text-slate-600">Chưa ghi nhận</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {u.is_blocked ? (
                        <div className="space-y-0.5">
                          <span className="rounded-md bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 font-bold text-[10px]">
                            Đã bị khóa
                          </span>
                          {u.blocked_reason ? (
                            <p className="text-[10px] text-red-300 truncate max-w-[150px]" title={u.blocked_reason}>
                              {u.blocked_reason}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="rounded-md bg-slate-900 text-slate-300 border border-slate-800 px-2 py-0.5 font-medium text-[10px]">
                          Bình thường
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canModify ? (
                          <>
                            {u.is_blocked ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveModalUser(u);
                                  setModalAction("unblock");
                                  setActionReason("Đã giải quyết vi phạm");
                                }}
                                className="h-7 text-[11px] bg-slate-900 border-slate-700 text-emerald-400"
                              >
                                Mở khóa
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveModalUser(u);
                                  setModalAction("block");
                                  setActionReason("");
                                }}
                                className="h-7 text-[11px] bg-slate-900 border-red-900 text-red-400 hover:bg-red-950"
                              >
                                Khóa
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActiveModalUser(u);
                                setModalAction("reset_ai");
                                setActionReason("Admin reset quota");
                              }}
                              className="h-7 text-[11px] bg-slate-900 border-slate-700 text-slate-300"
                              title="Đặt lại lượt AI hôm nay về 0"
                            >
                              Reset AI
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActiveModalUser(u);
                                setModalAction("custom_ai");
                                setCustomAiLimitInput(u.custom_ai_daily_limit ?? 50);
                                setActionReason("Hạn mức riêng");
                              }}
                              className="h-7 text-[11px] bg-slate-900 border-slate-700 text-teal-400"
                              title="Đặt hạn mức AI riêng cho người này"
                            >
                              Hạn mức AI
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActiveModalUser(u);
                                setModalAction("delete");
                                setActionReason("");
                              }}
                              className="h-7 text-[11px] bg-slate-900 border-red-950 text-red-500 hover:bg-red-950"
                              title="Xóa tài khoản theo yêu cầu"
                            >
                              Xóa
                            </Button>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">
                            Không áp dụng
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {users.length === 0 && !loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {vi.admin.users.noUsersFound}
          </div>
        ) : null}
      </div>

      {/* Modal xác nhận thao tác quản trị */}
      {activeModalUser && modalAction ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-white">
              {modalAction === "block" && `Khóa tài khoản ${activeModalUser.display_name}`}
              {modalAction === "unblock" && `Mở khóa cho ${activeModalUser.display_name}`}
              {modalAction === "reset_ai" && `Đặt lại lượt AI hôm nay cho ${activeModalUser.display_name}`}
              {modalAction === "custom_ai" && `Đặt hạn mức AI riêng: ${activeModalUser.display_name}`}
              {modalAction === "delete" && `⚠️ XÓA VĨNH VIỄN tài khoản ${activeModalUser.display_name}`}
            </h3>

            {modalAction === "custom_ai" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">
                  {vi.admin.users.customAiLimitPrompt}
                </label>
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  value={customAiLimitInput}
                  onChange={(e) => setCustomAiLimitInput(Number(e.target.value))}
                  className="bg-slate-900 border-slate-800 text-white"
                />
                <span className="text-[11px] text-slate-500">
                  (Đặt 0 để chặn AI, đặt giá trị lớn hơn để ưu tiên)
                </span>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400">
                {vi.admin.users.reasonPrompt}
              </label>
              <textarea
                required={modalAction === "block" || modalAction === "delete"}
                rows={3}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={vi.admin.users.reasonPlaceholder}
                className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
              />
            </div>

            {actionError ? (
              <div className="rounded-xl border border-red-900 bg-red-950/60 p-3 text-xs text-red-400">
                ⚠️ {actionError}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setActiveModalUser(null);
                  setModalAction(null);
                }}
                disabled={actionLoading}
                className="bg-slate-900 border-slate-800 text-slate-300"
              >
                Hủy
              </Button>
              <Button
                onClick={handleExecuteAction}
                disabled={
                  actionLoading ||
                  ((modalAction === "block" || modalAction === "delete") &&
                    actionReason.trim().length === 0)
                }
                className={
                  modalAction === "delete" || modalAction === "block"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-teal-500 text-slate-950 hover:bg-teal-400 font-bold"
                }
              >
                {actionLoading ? "Đang xử lý..." : vi.admin.users.confirmAction}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

