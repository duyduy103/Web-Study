-- ============================================================================
-- MemoQuiz - Bước 12 (Giai đoạn D): Nền tảng Admin & Hệ thống Phản hồi (Feedback)
-- ============================================================================

-- 1. BẢNG ADMINS (Quản trị viên)
-- Nguyên tắc an toàn: Không lưu trong profiles.role, không nhận từ client.
-- Không có policy ghi (insert/update/delete) cho anon/authenticated; chỉ tạo bằng SQL chạy tay.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Policy đọc: Chỉ admin mới có thể xem danh sách admin (hoặc tự xem chính mình)
create policy admins_select_self on public.admins
  for select to authenticated
  using (user_id = auth.uid());

-- 2. HÀM KIỂM TRA QUYỀN ADMIN (is_admin)
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admins where user_id = coalesce(p_user_id, auth.uid())
  );
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;

-- 3. BẢNG NHẬT KÝ THAO TÁC ADMIN (admin_audit_log)
-- Mọi hành động của admin (khóa/mở user, trả lời/đổi trạng thái feedback, v.v.) đều được ghi lại
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  before_state jsonb,
  after_state jsonb,
  reason text,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

-- Policy: Chỉ admin mới đọc được nhật ký audit
create policy admin_audit_log_select on public.admin_audit_log
  for select to authenticated
  using (public.is_admin());

-- Policy: Admin có thể ghi log audit
create policy admin_audit_log_insert on public.admin_audit_log
  for insert to authenticated
  with check (public.is_admin() and admin_id = auth.uid());

create index if not exists idx_admin_audit_log_created_at
  on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_log_admin_id
  on public.admin_audit_log (admin_id);
create index if not exists idx_admin_audit_log_target
  on public.admin_audit_log (target_type, target_id);

-- 4. BẢNG PHẢN HỒI (feedback)
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('bug', 'idea', 'question', 'upgrade_request', 'other')),
  content text not null check (char_length(content) >= 10 and char_length(content) <= 2000),
  contact_email text,
  context_meta jsonb not null default '{}'::jsonb,
  admin_notes text,
  public_response text,
  public_response_at timestamptz,
  user_read_at timestamptz,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'ignored')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- 4.1. Policy Thêm: Khách chưa đăng nhập (cần email hợp lệ) hoặc người đã đăng nhập
create policy feedback_insert on public.feedback
  for insert to anon, authenticated
  with check (
    (auth.uid() is null and user_id is null and contact_email is not null and contact_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
    or
    (auth.uid() is not null and (user_id = auth.uid() or user_id is null))
  );

-- 4.2. Policy Đọc: Người dùng xem phản hồi của chính mình, Admin xem tất cả phản hồi
create policy feedback_select on public.feedback
  for select to authenticated
  using (
    user_id = auth.uid()
    or
    public.is_admin()
  );

-- 4.3. Policy Cập nhật:
-- Admin có thể cập nhật trạng thái, mức ưu tiên, ghi chú nội bộ, phản hồi công khai
create policy feedback_update_admin on public.feedback
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Người dùng có thể đánh dấu đã đọc phản hồi công khai của admin (user_read_at)
create policy feedback_update_user_read on public.feedback
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_feedback_user_id
  on public.feedback (user_id);
create index if not exists idx_feedback_status_priority
  on public.feedback (status, priority, created_at desc);
create index if not exists idx_feedback_unread_response
  on public.feedback (user_id)
  where public_response is not null and user_read_at is null;

-- 5. RPC ĐẾM PHẢN HỒI CHO MENU ADMIN (get_admin_feedback_counts)
create or replace function public.get_admin_feedback_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count integer := 0;
  v_in_progress integer := 0;
  v_resolved integer := 0;
  v_ignored integer := 0;
  v_total integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  select count(*) into v_total from public.feedback;
  select count(*) into v_new_count from public.feedback where status = 'new';
  select count(*) into v_in_progress from public.feedback where status = 'in_progress';
  select count(*) into v_resolved from public.feedback where status = 'resolved';
  select count(*) into v_ignored from public.feedback where status = 'ignored';

  return jsonb_build_object(
    'total', v_total,
    'new_count', v_new_count,
    'in_progress', v_in_progress,
    'resolved', v_resolved,
    'ignored', v_ignored
  );
end;
$$;

grant execute on function public.get_admin_feedback_counts() to authenticated;

