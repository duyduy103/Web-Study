"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Input } from "@/components/ui/input";

export interface AuditRecord {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string;
  before_state: unknown;
  after_state: unknown;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
}

export function AdminAuditWorkspace({ initialLogs }: { initialLogs: AuditRecord[] }) {
  const [logs] = React.useState<AuditRecord[]>(initialLogs);
  const [search, setSearch] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("all");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const filteredLogs = React.useMemo(() => {
    return logs.filter((l) => {
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (search.trim()) {
        const term = search.toLowerCase();
        const mReason = l.reason?.toLowerCase().includes(term);
        const mTarget = l.target_id.toLowerCase().includes(term);
        const mAction = l.action.toLowerCase().includes(term);
        if (!mReason && !mTarget && !mAction) return false;
      }
      return true;
    });
  }, [logs, actionFilter, search]);

  const getActionBadge = (action: string) => {
    if (action.includes("block")) {
      return <span className="rounded bg-red-950 border border-red-800 text-red-400 px-2 py-0.5 text-[10px] font-bold">Khóa</span>;
    }
    if (action.includes("unblock")) {
      return <span className="rounded bg-emerald-950 border border-emerald-800 text-emerald-400 px-2 py-0.5 text-[10px] font-bold">Mở khóa</span>;
    }
    if (action.includes("delete")) {
      return <span className="rounded bg-rose-950 border border-rose-800 text-rose-400 px-2 py-0.5 text-[10px] font-black">Xóa</span>;
    }
    if (action.includes("ai")) {
      return <span className="rounded bg-teal-950 border border-teal-800 text-teal-400 px-2 py-0.5 text-[10px] font-bold">Hạn mức AI</span>;
    }
    if (action.includes("feedback")) {
      return <span className="rounded bg-sky-950 border border-sky-800 text-sky-400 px-2 py-0.5 text-[10px] font-bold">Góp ý</span>;
    }
    return <span className="rounded bg-slate-800 text-slate-300 px-2 py-0.5 text-[10px] font-medium">{action}</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white sm:text-3xl">
          {vi.admin.auditTitle}
        </h1>
        <p className="mt-0.5 text-xs text-slate-400">
          {vi.admin.auditSubtitle} ({logs.length} bản ghi)
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo lý do, mã đối tượng..."
            className="w-full sm:w-72 bg-slate-900 border-slate-800 text-white placeholder:text-slate-500 h-9 text-xs"
          />

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 focus:outline-none"
          >
            <option value="all">Tất cả hành động</option>
            <option value="user_block">Khóa tài khoản</option>
            <option value="user_unblock">Mở khóa tài khoản</option>
            <option value="user_reset_ai_quota">Reset lượt AI</option>
            <option value="user_set_custom_ai_limit">Chỉnh hạn mức AI</option>
            <option value="user_delete_user">Xóa tài khoản</option>
            <option value="feedback_update">Cập nhật phản hồi</option>
            <option value="feedback_batch_update">Cập nhật phản hồi hàng loạt</option>
          </select>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-950 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Thời gian</th>
                <th className="py-3 px-4">Hành động</th>
                <th className="py-3 px-4">Đối tượng</th>
                <th className="py-3 px-4">Lý do</th>
                <th className="py-3 px-4">Admin</th>
                <th className="py-3 px-4 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredLogs.map((log) => {
                const isExpanded = expandedId === log.id;

                return (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {getActionBadge(log.action)}
                          <span className="font-mono text-[10px] text-slate-500">
                            {log.action}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-300">
                            {log.target_type}
                          </span>
                          <p className="font-mono text-[10px] text-slate-500 truncate max-w-[140px]">
                            {log.target_id}
                          </p>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        {log.reason || <span className="italic text-slate-600">—</span>}
                      </td>

                      <td className="py-3 px-4 font-mono text-[10px] text-teal-400">
                        {log.admin_id.slice(0, 8)}...
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-800"
                        >
                          {isExpanded ? "Đóng ▲" : "Xem JSON ▼"}
                        </button>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr className="bg-slate-900/70 border-b border-slate-800">
                        <td colSpan={6} className="p-4 space-y-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <span className="text-[10px] font-bold uppercase text-slate-400">
                                Trước thao tác (Before):
                              </span>
                              <pre className="mt-1 rounded-xl bg-slate-950 p-3 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-48">
                                {JSON.stringify(log.before_state, null, 2) || "null"}
                              </pre>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase text-teal-400">
                                Sau thao tác (After):
                              </span>
                              <pre className="mt-1 rounded-xl bg-slate-950 p-3 text-[10px] font-mono text-teal-300 overflow-x-auto max-h-48">
                                {JSON.stringify(log.after_state, null, 2) || "null"}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Không có nhật ký nào phù hợp.
          </div>
        ) : null}
      </div>
    </div>
  );
}
