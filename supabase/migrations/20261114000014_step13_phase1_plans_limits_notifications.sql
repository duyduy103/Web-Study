-- ============================================================================
-- MemoQuiz - Bước 13 (Giai đoạn 1): Gói hiển thị rõ, giới hạn theo gói, thông báo
-- ============================================================================

-- 0. Đảm bảo cột updated_at trên ai_usage tồn tại (an toàn nếu chưa chạy bản vá #13)
alter table public.ai_usage
  add column if not exists updated_at timestamptz not null default now();

-- 1. MỞ RỘNG BẢNG PLANS: thêm cột prices (jsonb) và period_days (jsonb)
alter table public.plans
  add column if not exists prices jsonb not null default '{}'::jsonb,
  add column if not exists period_days jsonb not null default '{}'::jsonb;

-- Seed 2 gói chuẩn theo yêu cầu Bước 13:
-- free: max_sets 3, ai_daily 10, max_file_mb 10, max_pdf_pages 30, storage_mb 50, max_print_versions 4, can_export_docx false
-- premium: max_sets 100, ai_daily 50, max_file_mb 20, max_pdf_pages 60, storage_mb 500, max_print_versions 8, can_export_docx true
-- prices premium: {"month": 39000, "year": 299000}, period_days: {"month": 30, "year": 365}
insert into public.plans (code, name, limits, prices, period_days, active)
values
  (
    'free',
    'Miễn phí',
    '{
      "max_sets": 3,
      "ai_daily": 10,
      "ai_daily_limit": 10,
      "max_file_mb": 10,
      "max_pdf_pages": 30,
      "storage_mb": 50,
      "max_print_versions": 4,
      "max_export_versions": 4,
      "can_export_docx": false,
      "max_questions_per_set": null,
      "max_sets_per_day": null
    }'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    true
  ),
  (
    'premium',
    'Premium',
    '{
      "max_sets": 100,
      "ai_daily": 50,
      "ai_daily_limit": 50,
      "max_file_mb": 20,
      "max_pdf_pages": 60,
      "storage_mb": 500,
      "max_print_versions": 8,
      "max_export_versions": 8,
      "can_export_docx": true,
      "max_questions_per_set": null,
      "max_sets_per_day": null
    }'::jsonb,
    '{"month": 39000, "year": 299000}'::jsonb,
    '{"month": 30, "year": 365}'::jsonb,
    true
  )
on conflict (code) do update
set name = excluded.name,
    limits = excluded.limits,
    prices = excluded.prices,
    period_days = excluded.period_days,
    active = excluded.active;

-- 2. BẢNG NOTIFICATIONS (Thông báo trong ứng dụng, chống tạo trùng theo dedupe_key)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_notifications_user_dedupe
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_notifications_user_unread_created
  on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications"
  on public.notifications
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
  on public.notifications
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users or admin can insert notifications" on public.notifications;
create policy "Users or admin can insert notifications"
  on public.notifications
  for insert
  with check (user_id = auth.uid() or public.is_admin());

-- 3. HÀM TẠO THÔNG BÁO AN TOÀN, CHỐNG TRÙNG LẶP (create_user_notification)
create or replace function public.create_user_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_notif_id uuid := null;
begin
  if p_user_id is null then
    return null;
  end if;

  -- Chỉ cho phép chính chủ (cho thông báo hết hạn tự kiểm tra) hoặc admin
  if v_caller is not null and v_caller != p_user_id and not public.is_admin(v_caller) then
    raise exception 'Unauthorized notification target' using errcode = '42501';
  end if;

  insert into public.notifications (
    user_id, type, title, body, metadata, dedupe_key
  ) values (
    p_user_id,
    p_type,
    p_title,
    p_body,
    coalesce(p_metadata, '{}'::jsonb),
    p_dedupe_key
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null
  do nothing
  returning id into v_notif_id;

  return v_notif_id;
end;
$$;

grant execute on function public.create_user_notification(uuid, text, text, text, jsonb, text) to authenticated;

-- 4. CẬP NHẬT HÀM get_entitlements:
-- Trả đầy đủ limits mới, prices, period_days và tự động tạo thông báo sắp hết hạn (7d/1d) hoặc vừa hết hạn (không trùng)
create or replace function public.get_entitlements(
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_sub record;
  v_latest_prem record;
  v_plan_code text := 'free';
  v_plan record;
  v_custom_limit integer := null;
  v_result_limits jsonb;
  v_ai_daily integer;
  v_days_left numeric;
begin
  if v_uid is null then
    select * into v_plan from public.plans where code = 'free';
    return jsonb_build_object(
      'plan_code', 'free',
      'plan_name', coalesce(v_plan.name, 'Miễn phí'),
      'is_premium', false,
      'status', 'active',
      'period_end', null,
      'source', 'default',
      'limits', coalesce(v_plan.limits, '{
        "max_sets": 3,
        "ai_daily": 10,
        "ai_daily_limit": 10,
        "max_file_mb": 10,
        "max_pdf_pages": 30,
        "storage_mb": 50,
        "max_print_versions": 4,
        "max_export_versions": 4,
        "can_export_docx": false
      }'::jsonb),
      'prices', coalesce(v_plan.prices, '{}'::jsonb),
      'period_days', coalesce(v_plan.period_days, '{}'::jsonb),
      'custom_ai_daily_limit', null
    );
  end if;

  -- 1. Lấy giới hạn AI tùy chỉnh riêng từ hồ sơ
  select custom_ai_daily_limit into v_custom_limit
  from public.profiles
  where id = v_uid;

  -- 2. Kiểm tra subscription đang hoạt động và còn hạn
  select * into v_sub
  from public.subscriptions
  where user_id = v_uid
    and status = 'active'
    and (period_end is null or period_end > now())
  order by (plan_code = 'premium') desc, created_at desc
  limit 1;

  if found and v_sub.plan_code is not null then
    v_plan_code := v_sub.plan_code;

    -- Kiểm tra mốc sắp hết hạn (7 ngày và 1 ngày) cho gói Premium có thời hạn
    if v_plan_code = 'premium' and v_sub.period_end is not null then
      v_days_left := extract(epoch from (v_sub.period_end - now())) / 86400.0;
      if v_days_left <= 1 and v_days_left > 0 then
        insert into public.notifications (user_id, type, title, body, metadata, dedupe_key)
        values (
          v_uid,
          'plan_expiring_soon',
          'Gói Premium còn dưới 1 ngày',
          'Gói Premium của bạn sẽ hết hạn vào ' || to_char(v_sub.period_end at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') || '. Hãy gia hạn để duy trì 50 lượt AI/ngày và xuất đề Word (.docx).',
          jsonb_build_object('subscription_id', v_sub.id, 'milestone', '1d', 'period_end', v_sub.period_end),
          'sub_expiring_1d_' || v_sub.id::text
        )
        on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      elsif v_days_left <= 7 and v_days_left > 1 then
        insert into public.notifications (user_id, type, title, body, metadata, dedupe_key)
        values (
          v_uid,
          'plan_expiring_soon',
          'Gói Premium sắp hết hạn',
          'Gói Premium của bạn còn khoảng ' || ceil(v_days_left)::text || ' ngày (đến ' || to_char(v_sub.period_end at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || '). Bạn có thể gia hạn bất cứ lúc nào để cộng dồn ngày sử dụng.',
          jsonb_build_object('subscription_id', v_sub.id, 'milestone', '7d', 'period_end', v_sub.period_end),
          'sub_expiring_7d_' || v_sub.id::text
        )
        on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      end if;
    end if;
  else
    v_plan_code := 'free';

    -- Kiểm tra xem có gói Premium nào vừa hết hạn chưa thông báo không
    select * into v_latest_prem
    from public.subscriptions
    where user_id = v_uid
      and plan_code = 'premium'
      and period_end is not null
      and period_end <= now()
    order by period_end desc
    limit 1;

    if found then
      if v_latest_prem.status = 'active' then
        update public.subscriptions
        set status = 'expired'
        where id = v_latest_prem.id;
      end if;

      insert into public.notifications (user_id, type, title, body, metadata, dedupe_key)
      values (
        v_uid,
        'plan_expired',
        'Gói Premium đã hết hạn',
        'Gói Premium của bạn đã hết hạn và tài khoản chuyển về gói Miễn phí. Toàn bộ bộ câu hỏi, bài kiểm tra và lịch ôn tập của bạn vẫn được giữ nguyên an toàn.',
        jsonb_build_object('subscription_id', v_latest_prem.id, 'period_end', v_latest_prem.period_end),
        'sub_expired_' || v_latest_prem.id::text
      )
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;

  -- 3. Lấy thông tin limits của gói
  select * into v_plan
  from public.plans
  where code = v_plan_code;

  if not found then
    select * into v_plan from public.plans where code = 'free';
    v_plan_code := 'free';
  end if;

  v_result_limits := coalesce(v_plan.limits, '{}'::jsonb);

  -- Đồng bộ hai khóa ai_daily và ai_daily_limit
  v_ai_daily := coalesce(
    v_custom_limit,
    (v_result_limits->>'ai_daily')::integer,
    (v_result_limits->>'ai_daily_limit')::integer,
    case when v_plan_code = 'premium' then 50 else 10 end
  );

  v_result_limits := jsonb_set(v_result_limits, '{ai_daily}', to_jsonb(v_ai_daily));
  v_result_limits := jsonb_set(v_result_limits, '{ai_daily_limit}', to_jsonb(v_ai_daily));

  return jsonb_build_object(
    'plan_code', v_plan_code,
    'plan_name', coalesce(v_plan.name, case when v_plan_code = 'premium' then 'Premium' else 'Miễn phí' end),
    'is_premium', (v_plan_code = 'premium'),
    'status', coalesce(v_sub.status, case when v_latest_prem.id is not null then 'expired' else 'active' end),
    'period_end', coalesce(v_sub.period_end, v_latest_prem.period_end),
    'source', coalesce(v_sub.source, 'default'),
    'limits', v_result_limits,
    'prices', coalesce(v_plan.prices, '{}'::jsonb),
    'period_days', coalesce(v_plan.period_days, '{}'::jsonb),
    'custom_ai_daily_limit', v_custom_limit
  );
end;
$$;

grant execute on function public.get_entitlements(uuid) to authenticated, anon;

-- 5. CẬP NHẬT consume_ai_quota_v2, consume_ai_quota, record_ai_tokens DÙNG MÚI GIỜ Asia/Ho_Chi_Minh
create or replace function public.consume_ai_quota_v2(
  p_user_limit integer default 10,
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
  v_vn_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_calls integer := 0;
  v_tokens integer := 0;
  v_global_calls integer := 0;
  v_is_blocked boolean := false;
  v_effective_limit integer := 10;
  v_entitlements jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select is_blocked into v_is_blocked
  from public.profiles
  where id = v_user_id;

  if v_is_blocked then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'ACCOUNT_BLOCKED',
      'calls', 0,
      'remaining', 0,
      'daily_limit', 0
    );
  end if;

  -- Lấy hạn mức AI hiệu lực từ get_entitlements (plans.limits.ai_daily hoặc custom_ai_daily_limit)
  v_entitlements := public.get_entitlements(v_user_id);
  v_effective_limit := coalesce(
    (v_entitlements->'limits'->>'ai_daily')::integer,
    (v_entitlements->'limits'->>'ai_daily_limit')::integer,
    coalesce(p_user_limit, 10)
  );

  if p_global_limit <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'GLOBAL_LIMIT',
      'calls', 0,
      'remaining', 0,
      'daily_limit', v_effective_limit
    );
  end if;

  if v_effective_limit <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'USER_LIMIT',
      'calls', 0,
      'remaining', 0,
      'daily_limit', v_effective_limit
    );
  end if;

  -- 1. Kiểm tra & tăng bộ đếm toàn hệ thống theo ngày Việt Nam
  insert into public.ai_global_usage (date, calls, tokens, updated_at)
  values (v_vn_today, 1, greatest(0, p_tokens), clock_timestamp())
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
      'calls', 0,
      'remaining', 0,
      'daily_limit', v_effective_limit
    );
  end if;

  -- 2. Kiểm tra & tăng bộ đếm cá nhân theo ngày Việt Nam
  insert into public.ai_usage (user_id, date, calls, tokens, updated_at)
  values (v_user_id, v_vn_today, 1, greatest(0, p_tokens), clock_timestamp())
  on conflict (user_id, date) do update
    set calls = public.ai_usage.calls + 1,
        tokens = public.ai_usage.tokens + greatest(0, p_tokens),
        updated_at = clock_timestamp()
    where public.ai_usage.calls < v_effective_limit
  returning calls, tokens into v_calls, v_tokens;

  if not found then
    -- Đã đạt hạn mức cá nhân: hoàn lại 1 lượt cho bộ đếm toàn hệ thống
    update public.ai_global_usage
    set calls = greatest(0, calls - 1),
        tokens = greatest(0, tokens - greatest(0, p_tokens)),
        updated_at = clock_timestamp()
    where date = v_vn_today;

    select calls into v_calls
    from public.ai_usage
    where user_id = v_user_id and date = v_vn_today;

    return jsonb_build_object(
      'allowed', false,
      'reason', 'USER_LIMIT',
      'calls', coalesce(v_calls, v_effective_limit),
      'remaining', 0,
      'daily_limit', v_effective_limit
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'calls', v_calls,
    'tokens', v_tokens,
    'remaining', greatest(0, v_effective_limit - v_calls),
    'daily_limit', v_effective_limit
  );
end;
$$;

grant execute on function public.consume_ai_quota_v2(integer, integer, integer) to authenticated;

create or replace function public.consume_ai_quota(
  p_daily_limit integer default 10,
  p_tokens integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_vn_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_calls integer;
  v_tokens integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_daily_limit <= 0 then
    select coalesce(calls, 0), coalesce(tokens, 0)
      into v_calls, v_tokens
      from public.ai_usage
      where user_id = v_user_id and date = v_vn_today;

    return jsonb_build_object(
      'allowed', false,
      'calls', coalesce(v_calls, 0),
      'tokens', coalesce(v_tokens, 0),
      'remaining', 0
    );
  end if;

  insert into public.ai_usage (user_id, date, calls, tokens)
  values (v_user_id, v_vn_today, 1, greatest(0, p_tokens))
  on conflict (user_id, date) do update
    set calls = public.ai_usage.calls + 1,
        tokens = public.ai_usage.tokens + greatest(0, p_tokens)
    where public.ai_usage.calls < p_daily_limit
  returning calls, tokens into v_calls, v_tokens;

  if found then
    return jsonb_build_object(
      'allowed', true,
      'calls', v_calls,
      'tokens', v_tokens,
      'remaining', greatest(0, p_daily_limit - v_calls)
    );
  end if;

  select calls, tokens
    into v_calls, v_tokens
    from public.ai_usage
    where user_id = v_user_id and date = v_vn_today;

  return jsonb_build_object(
    'allowed', false,
    'calls', coalesce(v_calls, p_daily_limit),
    'tokens', coalesce(v_tokens, 0),
    'remaining', 0
  );
end;
$$;

grant execute on function public.consume_ai_quota(integer, integer) to authenticated;

create or replace function public.record_ai_tokens(
  p_tokens integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_vn_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  v_user_id := auth.uid();
  if v_user_id is null or p_tokens <= 0 then
    return;
  end if;

  update public.ai_usage
    set tokens = public.ai_usage.tokens + p_tokens
    where user_id = v_user_id and date = v_vn_today;
end;
$$;

grant execute on function public.record_ai_tokens(integer) to authenticated;

-- 6. CẬP NHẬT admin_manage_user: GỬI THÔNG BÁO KHI ADMIN CẤP / THU HỒI GÓI HOẶC ĐẶT HẠN MỨC AI
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
  v_vn_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_is_target_admin boolean := false;
  v_before jsonb;
  v_after jsonb;
  v_period_end timestamptz := null;
  v_sub_id uuid := null;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  select exists(select 1 from public.admins where user_id = p_target_user_id) into v_is_target_admin;

  if p_target_user_id = v_admin_id and p_action in ('block', 'delete_user') then
    raise exception 'Không thể tự khóa hoặc xóa tài khoản của chính mình' using errcode = '42501';
  end if;

  if v_is_target_admin and p_action in ('block', 'delete_user') then
    raise exception 'Không thể khóa hoặc xóa tài khoản của quản trị viên khác' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(p.*),
    'subscription', (
      select to_jsonb(s.*)
      from public.subscriptions s
      where s.user_id = p_target_user_id and s.status = 'active'
      order by s.created_at desc limit 1
    )
  ) into v_before
  from public.profiles p where p.id = p_target_user_id;

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
    where user_id = p_target_user_id and date = v_vn_today;

  elsif p_action = 'set_custom_ai_limit' then
    update public.profiles
    set custom_ai_daily_limit = p_custom_limit
    where id = p_target_user_id;

    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      p_target_user_id,
      'plan_changed',
      'Cập nhật hạn mức AI hằng ngày',
      case
        when p_custom_limit is null then 'Hạn mức AI hằng ngày của bạn đã được đặt về mặc định theo gói hiện tại.'
        else 'Quản trị viên đã đặt hạn mức AI riêng cho tài khoản của bạn: ' || p_custom_limit::text || ' lượt/ngày.'
      end,
      jsonb_build_object('custom_ai_daily_limit', p_custom_limit, 'reason', p_reason)
    );

  elsif p_action = 'grant_premium' then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'Bắt buộc nhập lý do cấp gói Premium';
    end if;

    if p_custom_limit is not null and p_custom_limit > 0 then
      v_period_end := now() + (p_custom_limit || ' days')::interval;
    else
      v_period_end := null;
    end if;

    update public.subscriptions
    set status = 'canceled'
    where user_id = p_target_user_id and status = 'active';

    insert into public.subscriptions (
      user_id, plan_code, status, period_end, source, granted_by
    ) values (
      p_target_user_id, 'premium', 'active', v_period_end, 'manual_grant', v_admin_id
    )
    returning id into v_sub_id;

    insert into public.notifications (user_id, type, title, body, metadata, dedupe_key)
    values (
      p_target_user_id,
      'plan_changed',
      'Tài khoản đã được nâng cấp lên gói Premium',
      case
        when v_period_end is null then 'Bạn đã được cấp gói Premium không thời hạn (vĩnh viễn). Chúc bạn học tập và giảng dạy hiệu quả!'
        else 'Bạn đã được cấp gói Premium đến ngày ' || to_char(v_period_end at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || '.'
      end,
      jsonb_build_object('subscription_id', v_sub_id, 'period_end', v_period_end, 'source', 'manual_grant'),
      'sub_granted_' || v_sub_id::text
    )
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  elsif p_action = 'revoke_premium' then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'Bắt buộc nhập lý do hủy gói Premium';
    end if;

    update public.subscriptions
    set status = 'canceled'
    where user_id = p_target_user_id and status = 'active';

    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      p_target_user_id,
      'plan_changed',
      'Gói Premium đã được thu hồi',
      'Tài khoản của bạn đã chuyển về gói Miễn phí (' || trim(p_reason) || '). Mọi dữ liệu hiện có vẫn được giữ nguyên an toàn.',
      jsonb_build_object('reason', trim(p_reason))
    );

  elsif p_action = 'delete_user' then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'Bắt buộc nhập lý do xóa tài khoản';
    end if;

    delete from public.question_sets where owner_id = p_target_user_id;
    delete from public.learners where user_id = p_target_user_id;
    delete from public.subscriptions where user_id = p_target_user_id;
    delete from public.notifications where user_id = p_target_user_id;
    delete from public.profiles where id = p_target_user_id;
    delete from auth.users where id = p_target_user_id;

  else
    raise exception 'Hành động không hợp lệ: %', p_action;
  end if;

  if p_action != 'delete_user' then
    select jsonb_build_object(
      'profile', to_jsonb(p.*),
      'subscription', (
        select to_jsonb(s.*)
        from public.subscriptions s
        where s.user_id = p_target_user_id and s.status = 'active'
        order by s.created_at desc limit 1
      )
    ) into v_after
    from public.profiles p where p.id = p_target_user_id;
  else
    v_after := jsonb_build_object('deleted', true);
  end if;

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

-- 7. CẬP NHẬT get_admin_users_list ĐỌC ai_today_calls THEO NGÀY VIỆT NAM
create or replace function public.get_admin_users_list(
  p_search text default null,
  p_role text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_users jsonb := '[]'::jsonb;
  v_vn_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  p_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  p_offset := greatest(0, coalesce(p_offset, 0));

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
      'ai_today_calls', coalesce((select calls from public.ai_usage au where au.user_id = p.id and au.date = v_vn_today), 0),
      'feedback_count', (select count(*) from public.feedback fb where fb.user_id = p.id),
      'subscription', (
        select jsonb_build_object(
          'plan_code', s.plan_code,
          'status', s.status,
          'period_end', s.period_end,
          'created_at', s.created_at
        )
        from public.subscriptions s
        where s.user_id = p.id
          and s.status = 'active'
          and (s.period_end is null or s.period_end > now())
        order by s.created_at desc
        limit 1
      )
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

