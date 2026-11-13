"use client";

import * as React from "react";
import { vi } from "@/lib/i18n/vi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FeedbackType, FeedbackStatus, FeedbackPriority } from "@/lib/supabase/types";

export interface AdminFeedbackRecord {
  id: string;
  user_id: string | null;
  type: FeedbackType;
  content: string;
  contact_email: string | null;
  context_meta: {
    url?: string;
    user_agent?: string;
    role?: string;
    user_id?: string;
    ip?: string;
  };
  admin_notes: string | null;
  public_response: string | null;
  public_response_at: string | null;
  user_read_at: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  created_at: string;
  updated_at: string;
}

export function AdminFeedbackWorkspace({
  initialFeedback,
}: {
  initialFeedback: AdminFeedbackRecord[];
}) {
  const [items, setItems] = React.useState<AdminFeedbackRecord[]>(initialFeedback);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialFeedback[0]?.id ?? null
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [priorityFilter, setPriorityFilter] = React.useState<string>("all");

  // Form edit state for currently selected item
  const selectedItem = items.find((x) => x.id === selectedId) ?? null;
  const [editStatus, setEditStatus] = React.useState<FeedbackStatus>("new");
  const [editPriority, setEditPriority] = React.useState<FeedbackPriority>("medium");
  const [editNotes, setEditNotes] = React.useState("");
  const [editResponse, setEditResponse] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  // Sync edit form when selectedId changes
  React.useEffect(() => {
    if (selectedItem) {
      setEditStatus(selectedItem.status);
      setEditPriority(selectedItem.priority);
      setEditNotes(selectedItem.admin_notes ?? "");
      setEditResponse(selectedItem.public_response ?? "");
      setSaveSuccess(false);
    }
  }, [selectedId, selectedItem]);

  // Client-side filtering
  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
      if (search.trim()) {
        const term = search.toLowerCase();
        const matchesContent = item.content.toLowerCase().includes(term);
        const matchesEmail = item.contact_email?.toLowerCase().includes(term);
        if (!matchesContent && !matchesEmail) return false;
      }
      return true;
    });
  }, [items, statusFilter, typeFilter, priorityFilter, search]);

  const handleSaveItem = async () => {
    if (!selectedItem) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedItem.id,
          status: editStatus,
          priority: editPriority,
          admin_notes: editNotes,
          public_response: editResponse,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cập nhật thất bại");

      setItems((prev) =>
        prev.map((it) => (it.id === selectedItem.id ? (data.feedback as AdminFeedbackRecord) : it))
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  };

  const handleBatchUpdate = async (newStatus: FeedbackStatus) => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          status: newStatus,
        }),
      });
      if (!res.ok) throw new Error("Cập nhật hàng loạt thất bại");

      setItems((prev) =>
        prev.map((it) =>
          selectedIds.includes(it.id) ? { ...it, status: newStatus } : it
        )
      );
      setSelectedIds([]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map((x) => x.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getStatusBadge = (status: FeedbackStatus) => {
    switch (status) {
      case "new":
        return <span className="rounded-md bg-sky-950 text-sky-400 border border-sky-800 px-2 py-0.5 text-[11px] font-bold">Mới gửi</span>;
      case "in_progress":
        return <span className="rounded-md bg-amber-950 text-amber-400 border border-amber-800 px-2 py-0.5 text-[11px] font-bold">Đang xử lý</span>;
      case "resolved":
        return <span className="rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 text-[11px] font-bold">Đã xong</span>;
      case "ignored":
        return <span className="rounded-md bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 text-[11px] font-bold">Đã ghi nhận</span>;
    }
  };

  const getPriorityBadge = (priority: FeedbackPriority) => {
    switch (priority) {
      case "urgent":
        return <span className="rounded-md bg-red-950 text-red-400 border border-red-800 px-1.5 py-0.2 text-[10px] font-extrabold uppercase">Khẩn cấp</span>;
      case "high":
        return <span className="rounded-md bg-rose-950 text-rose-300 border border-rose-800 px-1.5 py-0.2 text-[10px] font-bold">Cao</span>;
      case "medium":
        return <span className="rounded-md bg-slate-800 text-slate-300 px-1.5 py-0.2 text-[10px]">Thường</span>;
      case "low":
        return <span className="rounded-md bg-slate-900 text-slate-500 px-1.5 py-0.2 text-[10px]">Thấp</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white sm:text-3xl">
          {vi.admin.feedbackTitle}
        </h1>
        <p className="mt-0.5 text-xs text-slate-400">
          {vi.admin.feedbackSubtitle}
        </p>
      </div>

      {/* Bộ lọc & Tìm kiếm */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={vi.admin.searchPlaceholder}
            className="w-full sm:w-64 bg-slate-900 border-slate-800 text-white placeholder:text-slate-500 h-9 text-xs"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-300 focus:outline-none"
          >
            <option value="all">{vi.admin.filterStatusAll}</option>
            <option value="new">Mới gửi</option>
            <option value="in_progress">Đang xử lý</option>
            <option value="resolved">Đã xong</option>
            <option value="ignored">Đã ghi nhận</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-300 focus:outline-none"
          >
            <option value="all">{vi.admin.filterTypeAll}</option>
            <option value="bug">{vi.feedback.types.bug}</option>
            <option value="idea">{vi.feedback.types.idea}</option>
            <option value="question">{vi.feedback.types.question}</option>
            <option value="upgrade_request">{vi.feedback.types.upgrade_request}</option>
            <option value="other">{vi.feedback.types.other}</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-300 focus:outline-none"
          >
            <option value="all">{vi.admin.filterPriorityAll}</option>
            <option value="urgent">Khẩn cấp</option>
            <option value="high">Cao</option>
            <option value="medium">Bình thường</option>
            <option value="low">Thấp</option>
          </select>
        </div>

        {selectedIds.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-teal-400">
              Đã chọn {selectedIds.length}:
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchUpdate("in_progress")}
              className="h-8 text-xs bg-slate-900 border-slate-700 text-slate-300"
            >
              {vi.admin.batchMarkInProgress}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchUpdate("resolved")}
              className="h-8 text-xs bg-slate-900 border-slate-700 text-emerald-400"
            >
              {vi.admin.batchMarkResolved}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBatchUpdate("ignored")}
              className="h-8 text-xs bg-slate-900 border-slate-700 text-slate-400"
            >
              {vi.admin.batchMarkIgnored}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Bố cục 2 cột: Danh sách bên trái, Chi tiết chỉnh sửa bên phải */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Danh sách phản hồi */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={
                  filteredItems.length > 0 &&
                  selectedIds.length === filteredItems.length
                }
                onChange={toggleSelectAll}
                className="rounded border-slate-700 bg-slate-900"
              />
              <span>Chọn tất cả ({filteredItems.length})</span>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950 p-8 text-center text-xs text-slate-500">
              {vi.admin.noFeedbackFound}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[750px] overflow-y-auto pr-1">
              {filteredItems.map((item) => {
                const isSelected = item.id === selectedId;
                const isChecked = selectedIds.includes(item.id);

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                      isSelected
                        ? "border-teal-500 bg-slate-950 shadow-md ring-1 ring-teal-500/40"
                        : "border-slate-800/80 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelectOne(item.id);
                          }}
                          className="rounded border-slate-700 bg-slate-900"
                        />
                        <span className="text-xs font-extrabold text-teal-400">
                          {vi.feedback.types[item.type] ?? item.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {getPriorityBadge(item.priority)}
                        {getStatusBadge(item.status)}
                      </div>
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-300">
                      {item.content}
                    </p>

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{item.contact_email || "Khách ẩn danh"}</span>
                      <span>
                        {new Date(item.created_at).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Khung xem chi tiết & Cập nhật phản hồi */}
        <div className="lg:col-span-7">
          {selectedItem ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6 space-y-5 sticky top-20 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-black text-white">
                    {vi.admin.detailsTitle}
                  </h2>
                  <span className="text-[11px] text-slate-500 font-mono">
                    ID: {selectedItem.id}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedItem.status)}
                  {getPriorityBadge(selectedItem.priority)}
                </div>
              </div>

              {/* Ngữ cảnh đính kèm & Thông tin người gửi */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3.5 space-y-2 text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                  {vi.admin.contextMetaTitle}
                </span>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Email:</span>
                    {selectedItem.contact_email ? (
                      <a
                        href={`mailto:${selectedItem.contact_email}?subject=[MemoQuiz]%20Phản%20hồi%20góp%20ý`}
                        className="font-bold text-teal-400 hover:underline flex items-center gap-1"
                        title={vi.admin.sendMailTooltip}
                      >
                        {selectedItem.contact_email} ↗
                      </a>
                    ) : (
                      <span className="text-slate-500">Không cung cấp</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-500">{vi.admin.userRoleLabel}</span>{" "}
                    <span className="font-bold">{selectedItem.context_meta?.role ?? "guest"}</span>
                  </div>
                  <div className="sm:col-span-2 truncate">
                    <span className="text-slate-500">{vi.admin.urlLabel}</span>{" "}
                    <span className="font-mono text-[11px] text-slate-300">
                      {selectedItem.context_meta?.url ?? "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Nội dung phản hồi: Render text thuần túy chống XSS */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Nội dung góp ý (từ người dùng)
                </Label>
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs font-medium text-slate-200 whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
                  {selectedItem.content}
                </div>
              </div>

              {/* Điều khiển chỉnh sửa */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-edit-status" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {vi.admin.statusLabel}
                  </Label>
                  <select
                    id="admin-edit-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as FeedbackStatus)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="new">Mới gửi</option>
                    <option value="in_progress">Đang xử lý</option>
                    <option value="resolved">Đã xong</option>
                    <option value="ignored">Đã ghi nhận</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="admin-edit-priority" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {vi.admin.priorityLabel}
                  </Label>
                  <select
                    id="admin-edit-priority"
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as FeedbackPriority)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="low">Thấp</option>
                    <option value="medium">Bình thường</option>
                    <option value="high">Cao</option>
                    <option value="urgent">Khẩn cấp</option>
                  </select>
                </div>
              </div>

              {/* Ghi chú nội bộ */}
              <div className="space-y-1.5">
                <Label htmlFor="admin-edit-notes" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {vi.admin.internalNotes}
                </Label>
                <textarea
                  id="admin-edit-notes"
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Ghi chú kỹ thuật hoặc phân công xử lý (người dùng không thấy)..."
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs text-white placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
                />
              </div>

              {/* Phản hồi công khai */}
              <div className="space-y-1.5">
                <Label htmlFor="admin-edit-response" className="text-xs font-bold uppercase tracking-wider text-teal-400">
                  {vi.admin.publicResponse}
                </Label>
                <textarea
                  id="admin-edit-response"
                  rows={3}
                  value={editResponse}
                  onChange={(e) => setEditResponse(e.target.value)}
                  placeholder="Nhập câu trả lời sẽ hiển thị trong trang 'Góp ý của tôi' của người dùng..."
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs text-white placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
                />
              </div>

              {saveSuccess ? (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/60 p-2.5 text-center text-xs font-bold text-emerald-400">
                  ✓ {vi.admin.updateSuccess}
                </div>
              ) : null}

              <div className="flex justify-end pt-1">
                <Button
                  onClick={handleSaveItem}
                  disabled={saving}
                  className="bg-teal-500 font-bold text-slate-950 hover:bg-teal-400 min-h-[40px] px-6"
                >
                  {saving ? vi.admin.savingChanges : vi.admin.saveChanges}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-800 bg-slate-950 p-12 text-center text-xs text-slate-500">
              Chọn một phản hồi từ danh sách bên trái để xem chi tiết và xử lý.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
