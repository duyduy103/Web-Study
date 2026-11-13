-- ============================================================================
-- MemoQuiz - Bước 12 (Giai đoạn C): Admin Thống Kê & Quản Lý Người Dùng
-- ============================================================================

-- 1. MỞ RỘNG BẢNG PROFILES: last_seen_at, is_blocked, custom_ai_daily_limit
alter table public.profiles
  add column if not exists last_seen_at timestamptz,
  add column if not exists is_blocked boolean not null default false,
  add column if not exists blocked_reason text,
  add column if not exists blocked_at timestamptz,
  add column if not exists custom_ai_daily_limit integer check (custom_ai_daily_limit is null or custom_ai_daily_limit >= 0);

create index if not exists idx_profiles_is_blocked on public.profiles (is_blocked);
create index if not exists idx_profiles_last_seen_at on public.profiles (last_seen_at desc);

-- 2. RPC CẬP NHẬT HOẠT ĐỘNG GẦN NHẤT (update_last_seen)
-- Nguyên tắc: Cập nhật tối đa 1 lần/giờ/người để tránh quá tải ghi
create or replace function public.update_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.profiles
  set last_seen_at = now()
  where id = auth.uid()
    and (last_seen_at is null or last_seen_at < now() - interval '1 hour');
end;
$$;

grant execute on function public.update_last_seen() to authenticated;

-- 3. CẬP NHẬT consume_ai_quota_v2 HỖ TRỢ custom_ai_daily_limit VÀ CHẶN NGƯỜI BỊ KHÓA
create or replace function public.consume_ai_quota_v2(
  p_user_limit integer default 30,
  p_global_limit integer default 500,
  p_tokens integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_calls integer := 0;
  v_tokens integer := 0;
  v_global_calls integer := 0;
  v_is_blocked boolean := false;
  v_custom_limit integer := null;
  v_effective_limit integer := coalesce(p_user_limit, 30);
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Kiểm tra trạng thái tài khoản
  select is_blocked, custom_ai_daily_limit
  into v_is_blocked, v_custom_limit
  from public.profiles
  where id = v_user_id;

  if v_is_blocked then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'ACCOUNT_BLOCKED',
      'calls', 0,
      'remaining', 0
    );
  end if;

  if v_custom_limit is not null then
    v_effective_limit := v_custom_limit;
  end if;

  if p_global_limit <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'GLOBAL_LIMIT',
      'calls', 0,
      'remaining', 0
    );
  end if;

  if v_effective_limit <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'USER_LIMIT',
      'calls', 0,
      'remaining', 0
    );
  end if;

  -- 1. Kiểm tra & tăng bộ đếm toàn hệ thống
  insert into public.ai_global_usage (date, calls, tokens, updated_at)
  values (current_date, 1, greatest(0, p_tokens), clock_timestamp())
  on conflict (date) do update
    set calls = public.ai_global_usage.calls + 1,
        tokens = public.ai_global_usage.tokens + greatest(0, p_tokens),
        updated_at = clock_timestamp()
    where public.ai_global_usage.calls < p_global_limit
  returning calls into v_global_calls;

  if not found then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'GLOBAL_LIMIT',
      'calls', p_global_limit,
      'remaining', 0
    );
  end if;

  -- 2. Kiểm tra & tăng bộ đếm cá nhân
  insert into public.ai_usage (user_id, date, calls, tokens)
  values (v_user_id, current_date, 1, greatest(0, p_tokens))
  on conflict (user_id, date) do update
    set calls = public.ai_usage.calls + 1,
        tokens = public.ai_usage.tokens + greatest(0, p_tokens)
    where public.ai_usage.calls < v_effective_limit
  returning calls, tokens into v_calls, v_tokens;

  if not found then
    -- Đã vượt hạn mức ngày cá nhân
    return jsonb_build_object(
      'allowed', false,
      'reason', 'USER_LIMIT',
      'calls', v_effective_limit,
      'remaining', 0
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'calls', v_calls,
    'remaining', greatest(0, v_effective_limit - v_calls),
    'daily_limit', v_effective_limit,
    'global_calls', v_global_calls
  );
end;
$$;

-- 4. RPC TỔNG HỢP TOÀN HỆ THỐNG CHO TRANG /admin (get_admin_system_overview)
create or replace function public.get_admin_system_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_users integer := 0;
  v_new_today integer := 0;
  v_new_7d integer := 0;
  v_new_30d integer := 0;
  v_teacher_count integer := 0;
  v_student_count integer := 0;
  v_dau integer := 0;
  v_wau integer := 0;
  v_mau integer := 0;
  v_question_sets integer := 0;
  v_questions integer := 0;
  v_exams integer := 0;
  v_attempts integer := 0;
  v_review_logs integer := 0;
  v_anonymous_learners integer := 0;
  v_ai_today_calls integer := 0;
  v_ai_total_tokens bigint := 0;
  v_storage_bytes bigint := 0;
  v_signups_30d jsonb := '[]'::jsonb;
  v_activity_30d jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  -- 1. Người dùng & vai trò
  select count(*) into v_total_users from public.profiles;
  select count(*) into v_new_today from public.profiles where created_at >= current_date;
  select count(*) into v_new_7d from public.profiles where created_at >= now() - interval '7 days';
  select count(*) into v_new_30d from public.profiles where created_at >= now() - interval '30 days';
  select count(*) into v_teacher_count from public.profiles where role = 'teacher';
  select count(*) into v_student_count from public.profiles where role = 'student';

  -- 2. Hoạt động DAU/WAU/MAU
  select count(*) into v_dau from public.profiles where last_seen_at >= now() - interval '1 day';
  select count(*) into v_wau from public.profiles where last_seen_at >= now() - interval '7 days';
  select count(*) into v_mau from public.profiles where last_seen_at >= now() - interval '30 days';

  -- 3. Số liệu nội dung & học tập
  select count(*) into v_question_sets from public.question_sets;
  select count(*) into v_questions from public.questions;
  select count(*) into v_exams from public.exams;
  select count(*) into v_attempts from public.attempts;
  select count(*) into v_review_logs from public.review_logs;
  select count(*) into v_anonymous_learners from public.learners where user_id is null;

  -- 4. AI usage
  select coalesce(calls, 0) into v_ai_today_calls from public.ai_global_usage where date = current_date;
  select coalesce(sum(tokens), 0) into v_ai_total_tokens from public.ai_global_usage;

  -- 5. Dung lượng Storage ước tính (dựa vào số lượng file)
  select coalesce(count(*) * 256000, 0) into v_storage_bytes from public.source_files;

  -- 6. Chuỗi 30 ngày đăng ký mới (cho biểu đồ CSS/SVG)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'label', to_char(d.day, 'DD/MM'),
      'count', coalesce(t.cnt, 0)
    ) order by d.day
  ), '[]'::jsonb) into v_signups_30d
  from generate_series(current_date - interval '29 days', current_date, interval '1 day') as d(day)
  left join (
    select date_trunc('day', created_at)::date as day, count(*) as cnt
    from public.profiles
    where created_at >= current_date - interval '29 days'
    group by 1
  ) t on t.day = d.day::date;

  -- 7. Chuỗi 30 ngày lượt ôn FSRS (cho biểu đồ CSS/SVG)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'label', to_char(d.day, 'DD/MM'),
      'count', coalesce(r.cnt, 0)
    ) order by d.day
  ), '[]'::jsonb) into v_activity_30d
  from generate_series(current_date - interval '29 days', current_date, interval '1 day') as d(day)
  left join (
    select date_trunc('day', reviewed_at)::date as day, count(*) as cnt
    from public.review_logs
    where reviewed_at >= current_date - interval '29 days'
    group by 1
  ) r on r.day = d.day::date;

  return jsonb_build_object(
    'users', jsonb_build_object(
      'total', v_total_users,
      'new_today', v_new_today,
      'new_7d', v_new_7d,
      'new_30d', v_new_30d,
      'teachers', v_teacher_count,
      'students', v_student_count,
      'dau', v_dau,
      'wau', v_wau,
      'mau', v_mau
    ),
    'content', jsonb_build_object(
      'question_sets', v_question_sets,
      'questions', v_questions,
      'exams', v_exams,
      'attempts', v_attempts,
      'review_logs', v_review_logs,
      'anonymous_learners', v_anonymous_learners
    ),
    'ai', jsonb_build_object(
      'today_calls', v_ai_today_calls,
      'total_tokens', v_ai_total_tokens
    ),
    'storage', jsonb_build_object(
      'estimated_bytes', v_storage_bytes
    ),
    'charts', jsonb_build_object(
      'signups_30d', v_signups_30d,
      'reviews_30d', v_activity_30d
    )
  );
end;
$$;

grant execute on function public.get_admin_system_overview() to authenticated;

-- 5. RPC LẤY DANH SÁCH NGƯỜI DÙNG CHO ADMIN (get_admin_users_list)
create or replace function public.get_admin_users_list(
  p_search text default null,
  p_role text default null,
  p_status text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_users jsonb := '[]'::jsonb;
  v_total integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  -- Đếm tổng
  select count(*) into v_total
  from public.profiles p
  left join auth.users u on u.id = p.id
  where (p_role is null or p_role = 'all' or p.role = p_role)
    and (
      p_status is null or p_status = 'all'
      or (p_status = 'blocked' and p.is_blocked = true)
      or (p_status = 'active' and p.is_blocked = false)
    )
    and (
      p_search is null or p_search = ''
      or p.display_name ilike '%' || p_search || '%'
      or u.email ilike '%' || p_search || '%'
    );

  -- Lấy danh sách kèm số liệu tổng hợp (KHÔNG kéo nội dung câu hỏi/file)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'email', u.email,
      'display_name', p.display_name,
      'role', p.role,
      'created_at', p.created_at,
      'last_seen_at', p.last_seen_at,
      'is_blocked', p.is_blocked,
      'blocked_reason', p.blocked_reason,
      'blocked_at', p.blocked_at,
      'custom_ai_daily_limit', p.custom_ai_daily_limit,
      'is_admin', exists(select 1 from public.admins a where a.user_id = p.id),
      'set_count', (select count(*) from public.question_sets qs where qs.owner_id = p.id),
      'ai_today_calls', coalesce((select calls from public.ai_usage au where au.user_id = p.id and au.date = current_date), 0),
      'feedback_count', (select count(*) from public.feedback fb where fb.user_id = p.id)
    ) order by p.created_at desc
  ), '[]'::jsonb) into v_users
  from (
    select p.*
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (p_role is null or p_role = 'all' or p.role = p_role)
      and (
        p_status is null or p_status = 'all'
        or (p_status = 'blocked' and p.is_blocked = true)
        or (p_status = 'active' and p.is_blocked = false)
      )
      and (
        p_search is null or p_search = ''
        or p.display_name ilike '%' || p_search || '%'
        or u.email ilike '%' || p_search || '%'
      )
    order by p.created_at desc
    limit p_limit
    offset p_offset
  ) p
  left join auth.users u on u.id = p.id;

  return jsonb_build_object(
    'users', v_users,
    'total', v_total
  );
end;
$$;

grant execute on function public.get_admin_users_list(text, text, text, integer, integer) to authenticated;

-- 6. RPC QUẢN LÝ THAO TÁC USER CỦA ADMIN (admin_manage_user)
-- Chặn admin tự khóa/xóa chính mình hoặc admin khác
create or replace function public.admin_manage_user(
  p_target_user_id uuid,
  p_action text,
  p_reason text,
  p_custom_limit integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_is_target_admin boolean := false;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  select exists(select 1 from public.admins where user_id = p_target_user_id) into v_is_target_admin;

  -- 1. Chặn tự khóa / xóa chính mình
  if p_target_user_id = v_admin_id and p_action in ('block', 'delete_user') then
    raise exception 'Không thể tự khóa hoặc xóa tài khoản của chính mình' using errcode = '42501';
  end if;

  -- 2. Chặn khóa / xóa admin khác
  if v_is_target_admin and p_action in ('block', 'delete_user') then
    raise exception 'Không thể khóa hoặc xóa tài khoản của quản trị viên khác' using errcode = '42501';
  end if;

  -- Lấy snapshot trước khi sửa
  select to_jsonb(p.*) into v_before from public.profiles p where p.id = p_target_user_id;

  if p_action = 'block' then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'Bắt buộc nhập lý do khóa tài khoản';
    end if;
    update public.profiles
    set is_blocked = true,
        blocked_reason = trim(p_reason),
        blocked_at = now()
    where id = p_target_user_id;

  elsif p_action = 'unblock' then
    update public.profiles
    set is_blocked = false,
        blocked_reason = null,
        blocked_at = null
    where id = p_target_user_id;

  elsif p_action = 'reset_ai_quota' then
    delete from public.ai_usage
    where user_id = p_target_user_id and date = current_date;

  elsif p_action = 'set_custom_ai_limit' then
    update public.profiles
    set custom_ai_daily_limit = p_custom_limit
    where id = p_target_user_id;

  elsif p_action = 'delete_user' then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'Bắt buộc nhập lý do xóa tài khoản';
    end if;

    -- Xóa cascade sạch sẽ (tương tự delete_my_account)
    delete from public.question_sets where owner_id = p_target_user_id;
    delete from public.learners where user_id = p_target_user_id;
    delete from public.profiles where id = p_target_user_id;
    -- Xóa khỏi auth.users
    delete from auth.users where id = p_target_user_id;

  else
    raise exception 'Hành động không hợp lệ: %', p_action;
  end if;

  -- Lấy snapshot sau khi sửa (nếu chưa xóa)
  if p_action != 'delete_user' then
    select to_jsonb(p.*) into v_after from public.profiles p where p.id = p_target_user_id;
  else
    v_after := jsonb_build_object('deleted', true);
  end if;

  -- Ghi nhật ký audit
  insert into public.admin_audit_log (
    admin_id, action, target_type, target_id, before_state, after_state, reason
  ) values (
    v_admin_id,
    'user_' || p_action,
    'user',
    p_target_user_id::text,
    v_before,
    v_after,
    p_reason
  );

  return jsonb_build_object('ok', true, 'action', p_action);
end;
$$;

grant execute on function public.admin_manage_user(uuid, text, text, integer) to authenticated;
