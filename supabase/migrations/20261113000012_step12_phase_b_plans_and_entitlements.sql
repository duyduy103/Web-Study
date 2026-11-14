-- MemoQuiz - Bước 12 (Giai đoạn B): Gói và quyền lợi (Plans & Entitlements)

-- 1. BẢNG PLANS: free & premium
create table if not exists public.plans (
  code text primary key,
  name text not null,
  limits jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed 2 gói chuẩn theo yêu cầu:
-- free: 100 câu/bộ, 1 bộ/ngày, AI 30 lượt/ngày, 1 mã đề khi xuất Word
-- premium: không giới hạn câu/bộ (null), không giới hạn bộ/ngày (null), AI 300 lượt/ngày, 4 mã đề
insert into public.plans (code, name, limits, active)
values
  (
    'free',
    'Miễn phí',
    '{
      "max_questions_per_set": 100,
      "max_sets_per_day": 1,
      "ai_daily_limit": 30,
      "max_export_versions": 1
    }'::jsonb,
    true
  ),
  (
    'premium',
    'Cao cấp (Premium)',
    '{
      "max_questions_per_set": null,
      "max_sets_per_day": null,
      "ai_daily_limit": 300,
      "max_export_versions": 4
    }'::jsonb,
    true
  )
on conflict (code) do update
set name = excluded.name,
    limits = excluded.limits,
    active = excluded.active;

alter table public.plans enable row level security;

create policy "Allow everyone to read active plans"
  on public.plans
  for select
  using (true);

-- 2. BẢNG SUBSCRIPTIONS
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.plans(code),
  status text not null default 'active' check (status in ('active', 'canceled', 'expired')),
  period_end timestamptz, -- null là vĩnh viễn (lifetime)
  source text not null default 'manual_grant',
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user_lookup
  on public.subscriptions (user_id, status, period_end);

alter table public.subscriptions enable row level security;

create policy "Users can read own subscriptions or admin read all"
  on public.subscriptions
  for select
  using (user_id = auth.uid() or public.is_admin());

-- 3. HÀM TÍNH QUYỀN LỢI HIỆU LỰC TẠI THỜI ĐIỂM ĐỌC (get_entitlements)
-- Tự động hết hạn về free nếu quá period_end; ưu tiên custom_ai_daily_limit từ admin
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
  v_plan_code text := 'free';
  v_plan record;
  v_custom_limit integer := null;
  v_result_limits jsonb;
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
      'limits', coalesce(v_plan.limits, '{"max_questions_per_set": 100, "max_sets_per_day": 1, "ai_daily_limit": 30, "max_export_versions": 1}'::jsonb),
      'custom_ai_daily_limit', null
    );
  end if;

  -- 1. Lấy giới hạn AI tùy chỉnh riêng từ hồ sơ
  select custom_ai_daily_limit into v_custom_limit
  from public.profiles
  where id = v_uid;

  -- 2. Kiểm tra subscription đang hoạt động
  select * into v_sub
  from public.subscriptions
  where user_id = v_uid
    and status = 'active'
    and (period_end is null or period_end > now())
  order by (plan_code = 'premium') desc, created_at desc
  limit 1;

  if found and v_sub.plan_code is not null then
    v_plan_code := v_sub.plan_code;
  else
    v_plan_code := 'free';
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

  -- 4. Hạn mức AI riêng ưu tiên hơn hạn mức mặc định của gói
  if v_custom_limit is not null then
    v_result_limits := jsonb_set(v_result_limits, '{ai_daily_limit}', to_jsonb(v_custom_limit));
  end if;

  return jsonb_build_object(
    'plan_code', v_plan_code,
    'plan_name', coalesce(v_plan.name, 'Miễn phí'),
    'is_premium', (v_plan_code = 'premium'),
    'status', coalesce(v_sub.status, 'active'),
    'period_end', v_sub.period_end,
    'source', coalesce(v_sub.source, 'default'),
    'limits', v_result_limits,
    'custom_ai_daily_limit', v_custom_limit
  );
end;
$$;

grant execute on function public.get_entitlements(uuid) to authenticated, anon;

-- 4. CẬP NHẬT consume_ai_quota_v2 ĐỌC HẠN MỨC TỪ get_entitlements
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
  v_effective_limit integer := 30;
  v_entitlements jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Kiểm tra trạng thái tài khoản bị khóa
  select is_blocked into v_is_blocked
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

  -- Lấy hạn mức AI hiệu lực từ get_entitlements
  v_entitlements := public.get_entitlements(v_user_id);
  v_effective_limit := coalesce((v_entitlements->'limits'->>'ai_daily_limit')::integer, coalesce(p_user_limit, 30));

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
      'calls', 0,
      'remaining', 0
    );
  end if;

  -- 2. Kiểm tra & tăng bộ đếm cá nhân
  insert into public.ai_usage (user_id, date, calls, tokens, updated_at)
  values (v_user_id, current_date, 1, greatest(0, p_tokens), clock_timestamp())
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
    where date = current_date;

    select calls into v_calls
    from public.ai_usage
    where user_id = v_user_id and date = current_date;

    return jsonb_build_object(
      'allowed', false,
      'reason', 'USER_LIMIT',
      'calls', coalesce(v_calls, v_effective_limit),
      'remaining', 0
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'calls', v_calls,
    'remaining', greatest(0, v_effective_limit - v_calls)
  );
end;
$$;

grant execute on function public.consume_ai_quota_v2(integer, integer, integer) to authenticated;

-- 5. CẬP NHẬT admin_manage_user HỖ TRỢ CẤP VÀ HỦY PREMIUM
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
  v_period_end timestamptz := null;
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
    where user_id = p_target_user_id and date = current_date;

  elsif p_action = 'set_custom_ai_limit' then
    update public.profiles
    set custom_ai_daily_limit = p_custom_limit
    where id = p_target_user_id;

  elsif p_action = 'grant_premium' then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'Bắt buộc nhập lý do cấp gói Premium';
    end if;

    -- p_custom_limit đại diện cho số ngày: null hoặc 0 là vĩnh viễn
    if p_custom_limit is not null and p_custom_limit > 0 then
      v_period_end := now() + (p_custom_limit || ' days')::interval;
    else
      v_period_end := null;
    end if;

    -- Hủy các gói active cũ
    update public.subscriptions
    set status = 'canceled'
    where user_id = p_target_user_id and status = 'active';

    insert into public.subscriptions (
      user_id, plan_code, status, period_end, source, granted_by
    ) values (
      p_target_user_id, 'premium', 'active', v_period_end, 'manual_grant', v_admin_id
    );

  elsif p_action = 'revoke_premium' then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'Bắt buộc nhập lý do hủy gói Premium';
    end if;

    update public.subscriptions
    set status = 'canceled'
    where user_id = p_target_user_id and status = 'active';

  elsif p_action = 'delete_user' then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'Bắt buộc nhập lý do xóa tài khoản';
    end if;

    delete from public.question_sets where owner_id = p_target_user_id;
    delete from public.learners where user_id = p_target_user_id;
    delete from public.subscriptions where user_id = p_target_user_id;
    delete from public.profiles where id = p_target_user_id;
    delete from auth.users where id = p_target_user_id;

  else
    raise exception 'Hành động không hợp lệ: %', p_action;
  end if;

  -- Lấy snapshot sau khi sửa (nếu chưa xóa)
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

-- 6. CẬP NHẬT get_admin_users_list BỔ SUNG THÔNG TIN SUBSCRIPTION
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
      'ai_today_calls', coalesce((select calls from public.ai_usage au where au.user_id = p.id and au.date = current_date), 0),
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

