-- ============================================================================
-- MemoQuiz - Bước 13 (Bản vá lỗi thu hồi gói Premium):
-- 1. Mở rộng public.subscriptions hỗ trợ status = 'revoked', revoked_at,
--    revoked_reason, revoked_by.
-- 2. Sửa public.get_entitlements:
--    - XÓA BỎ bước tự tạo lại subscription từ bảng orders (nguyên nhân gốc khiến
--      gói vừa bị thu hồi lại tự hồi sinh ở lần gọi kế tiếp).
--    - Chỉ coi một dòng là hiệu lực khi status = 'active' VÀ
--      (period_end is null OR period_end > now()) VÀ revoked_at is null.
--    - Mọi trạng thái khác ('revoked', 'canceled', 'expired', quá hạn) đều về Free.
-- 3. Sửa public.admin_manage_user (revoke_premium) và admin_manage_payment_order:
--    - Vô hiệu hóa TẤT CẢ dòng hiệu lực của người dùng (status = 'revoked',
--      period_end = now(), revoked_at = now(), revoked_reason).
--    - Hỗ trợ tùy chọn xóa hạn mức AI riêng (p_clear_custom_ai_limit) và đánh dấu
--      đơn hàng liên quan là 'refunded' (p_refund_latest_order).
--    - Ghi đầy đủ admin_audit_log (trước/sau) và gửi thông báo "Gói Premium của bạn đã bị thu hồi".
-- ============================================================================

-- 1. MỞ RỘNG BẢNG public.subscriptions HỖ TRỢ TRẠNG THÁI 'revoked'
alter table public.subscriptions
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text,
  add column if not exists revoked_by uuid references auth.users(id) on delete set null;

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.subscriptions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.subscriptions drop constraint if exists %I', r.conname);
  end loop;
end;
$$;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('active', 'canceled', 'expired', 'revoked'));

-- 2. CẬP NHẬT public.get_entitlements:
--    - KHÔNG tự khôi phục subscription từ bảng orders.
--    - Chỉ nhận dòng status = 'active' VÀ (period_end is null OR period_end > now()) VÀ revoked_at is null.
--    - Nếu có nhiều dòng hiệu lực, chọn gói tốt nhất hợp lệ.
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
  v_sub_id uuid := null;
  v_sub_plan_code text := null;
  v_sub_status text := null;
  v_sub_period_end timestamptz := null;
  v_sub_source text := null;
  v_inactive_id uuid := null;
  v_inactive_status text := null;
  v_inactive_period_end timestamptz := null;
  v_inactive_source text := null;
  v_plan_code text := 'free';
  v_plan_name text := 'Miễn phí';
  v_raw_limits jsonb := '{}'::jsonb;
  v_plan_prices jsonb := '{}'::jsonb;
  v_plan_period_days jsonb := '{}'::jsonb;
  v_custom_limit integer := null;
  v_result_limits jsonb;
  v_max_sets integer;
  v_ai_daily integer;
  v_max_file_mb integer;
  v_max_pdf_pages integer;
  v_storage_mb integer;
  v_max_print_versions integer;
  v_can_export_docx boolean;
  v_days_left numeric;
begin
  if v_uid is null then
    select name, coalesce(limits, '{}'::jsonb), coalesce(prices, '{}'::jsonb), coalesce(period_days, '{}'::jsonb)
    into v_plan_name, v_raw_limits, v_plan_prices, v_plan_period_days
    from public.plans
    where code = 'free';

    v_ai_daily := coalesce((v_raw_limits->>'ai_daily')::integer, (v_raw_limits->>'ai_daily_limit')::integer, 10);
    v_max_print_versions := coalesce((v_raw_limits->>'max_print_versions')::integer, (v_raw_limits->>'max_export_versions')::integer, 4);

    return jsonb_build_object(
      'plan_code', 'free',
      'plan_name', coalesce(v_plan_name, 'Miễn phí'),
      'is_premium', false,
      'status', 'active',
      'period_end', null,
      'source', 'default',
      'limits', jsonb_build_object(
        'max_sets', coalesce((v_raw_limits->>'max_sets')::integer, 3),
        'ai_daily', v_ai_daily,
        'ai_daily_limit', v_ai_daily,
        'max_file_mb', coalesce((v_raw_limits->>'max_file_mb')::integer, 10),
        'max_pdf_pages', coalesce((v_raw_limits->>'max_pdf_pages')::integer, 30),
        'storage_mb', coalesce((v_raw_limits->>'storage_mb')::integer, 50),
        'max_print_versions', v_max_print_versions,
        'max_export_versions', v_max_print_versions,
        'can_export_docx', coalesce((v_raw_limits->>'can_export_docx')::boolean, false),
        'max_questions_per_set', null,
        'max_sets_per_day', null
      ),
      'prices', coalesce(v_plan_prices, '{}'::jsonb),
      'period_days', coalesce(v_plan_period_days, '{}'::jsonb),
      'custom_ai_daily_limit', null
    );
  end if;

  -- 1. Lấy giới hạn AI tùy chỉnh riêng từ hồ sơ (ngoại lệ do admin đặt)
  select custom_ai_daily_limit into v_custom_limit
  from public.profiles
  where id = v_uid;

  -- 2. Tự động đánh dấu 'expired' các dòng đang 'active' nhưng đã quá hạn (period_end <= now())
  for v_inactive_id, v_inactive_period_end in
    update public.subscriptions
    set status = 'expired'
    where user_id = v_uid
      and status = 'active'
      and period_end is not null
      and period_end <= now()
    returning id, period_end
  loop
    begin
      insert into public.notifications (user_id, type, title, body, metadata, dedupe_key)
      values (
        v_uid,
        'plan_expired',
        'Gói Premium đã hết hạn',
        'Gói Premium của bạn đã hết hạn và tài khoản chuyển về gói Miễn phí. Toàn bộ bộ câu hỏi, bài kiểm tra và lịch ôn tập của bạn vẫn được giữ nguyên an toàn.',
        jsonb_build_object('subscription_id', v_inactive_id, 'period_end', v_inactive_period_end),
        'sub_expired_' || v_inactive_id::text
      )
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    exception when others then
      null;
    end;
  end loop;

  -- 3. Tìm dòng subscription hiệu lực: BẮT BUỘC status = 'active' VÀ (period_end is null OR period_end > now()) VÀ revoked_at is null
  -- Nếu có nhiều dòng hiệu lực thì chọn gói tốt nhất hợp lệ (ưu tiên premium, vĩnh viễn hoặc hạn xa nhất)
  select id, plan_code, status, period_end, source
  into v_sub_id, v_sub_plan_code, v_sub_status, v_sub_period_end, v_sub_source
  from public.subscriptions
  where user_id = v_uid
    and status = 'active'
    and revoked_at is null
    and (period_end is null or period_end > now())
  order by (plan_code = 'premium') desc, (period_end is null) desc, period_end desc, created_at desc
  limit 1;

  if v_sub_id is not null and v_sub_plan_code is not null then
    v_plan_code := v_sub_plan_code;

    -- Kiểm tra mốc sắp hết hạn (7 ngày và 1 ngày) cho gói Premium có thời hạn
    if v_plan_code = 'premium' and v_sub_period_end is not null then
      v_days_left := extract(epoch from (v_sub_period_end - now())) / 86400.0;
      begin
        if v_days_left <= 1 and v_days_left > 0 then
          insert into public.notifications (user_id, type, title, body, metadata, dedupe_key)
          values (
            v_uid,
            'plan_expiring_soon',
            'Gói Premium còn dưới 1 ngày',
            'Gói Premium của bạn sẽ hết hạn vào ' || to_char(v_sub_period_end at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') || '. Hãy gia hạn để duy trì 50 lượt AI/ngày và xuất đề Word (.docx).',
            jsonb_build_object('subscription_id', v_sub_id, 'milestone', '1d', 'period_end', v_sub_period_end),
            'sub_expiring_1d_' || v_sub_id::text
          )
          on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
        elsif v_days_left <= 7 and v_days_left > 1 then
          insert into public.notifications (user_id, type, title, body, metadata, dedupe_key)
          values (
            v_uid,
            'plan_expiring_soon',
            'Gói Premium sắp hết hạn',
            'Gói Premium của bạn còn khoảng ' || ceil(v_days_left)::text || ' ngày (đến ' || to_char(v_sub_period_end at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || '). Bạn có thể gia hạn bất cứ lúc nào để cộng dồn ngày sử dụng.',
            jsonb_build_object('subscription_id', v_sub_id, 'milestone', '7d', 'period_end', v_sub_period_end),
            'sub_expiring_7d_' || v_sub_id::text
          )
          on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
        end if;
      exception when others then
        null;
      end;
    end if;
  else
    -- Không có dòng hiệu lực -> BẮT BUỘC về gói Free
    v_plan_code := 'free';

    select id, status, period_end, source
    into v_inactive_id, v_inactive_status, v_inactive_period_end, v_inactive_source
    from public.subscriptions
    where user_id = v_uid
    order by created_at desc
    limit 1;
  end if;

  -- 4. Lấy thông tin limits, prices, period_days của gói
  select name, coalesce(limits, '{}'::jsonb), coalesce(prices, '{}'::jsonb), coalesce(period_days, '{}'::jsonb)
  into v_plan_name, v_raw_limits, v_plan_prices, v_plan_period_days
  from public.plans
  where code = v_plan_code;

  if not found then
    v_plan_code := 'free';
    select name, coalesce(limits, '{}'::jsonb), coalesce(prices, '{}'::jsonb), coalesce(period_days, '{}'::jsonb)
    into v_plan_name, v_raw_limits, v_plan_prices, v_plan_period_days
    from public.plans
    where code = 'free';
  end if;

  v_raw_limits := coalesce(v_raw_limits, '{}'::jsonb);

  -- 5. Chuẩn hóa mọi khóa trong limits: nếu thiếu khóa thì dùng mặc định an toàn của gói Free
  v_max_sets := coalesce((v_raw_limits->>'max_sets')::integer, 3);
  v_ai_daily := coalesce(
    v_custom_limit,
    (v_raw_limits->>'ai_daily')::integer,
    (v_raw_limits->>'ai_daily_limit')::integer,
    10
  );
  v_max_file_mb := coalesce((v_raw_limits->>'max_file_mb')::integer, 10);
  v_max_pdf_pages := coalesce((v_raw_limits->>'max_pdf_pages')::integer, 30);
  v_storage_mb := coalesce((v_raw_limits->>'storage_mb')::integer, 50);
  v_max_print_versions := coalesce(
    (v_raw_limits->>'max_print_versions')::integer,
    (v_raw_limits->>'max_export_versions')::integer,
    4
  );
  v_can_export_docx := coalesce((v_raw_limits->>'can_export_docx')::boolean, false);

  v_result_limits := v_raw_limits || jsonb_build_object(
    'max_sets', v_max_sets,
    'ai_daily', v_ai_daily,
    'ai_daily_limit', v_ai_daily,
    'max_file_mb', v_max_file_mb,
    'max_pdf_pages', v_max_pdf_pages,
    'storage_mb', v_storage_mb,
    'max_print_versions', v_max_print_versions,
    'max_export_versions', v_max_print_versions,
    'can_export_docx', v_can_export_docx
  );

  return jsonb_build_object(
    'plan_code', v_plan_code,
    'plan_name', coalesce(v_plan_name, case when v_plan_code = 'premium' then 'Premium' else 'Miễn phí' end),
    'is_premium', (v_plan_code = 'premium'),
    'status', coalesce(
      v_sub_status,
      case
        when v_inactive_status = 'revoked' then 'revoked'
        when v_inactive_status = 'expired' then 'expired'
        else 'active'
      end
    ),
    'period_end', coalesce(v_sub_period_end, v_inactive_period_end),
    'source', coalesce(v_sub_source, v_inactive_source, 'default'),
    'limits', v_result_limits,
    'prices', coalesce(v_plan_prices, '{}'::jsonb),
    'period_days', coalesce(v_plan_period_days, '{}'::jsonb),
    'custom_ai_daily_limit', v_custom_limit
  );
end;
$$;

grant execute on function public.get_entitlements(uuid) to authenticated, anon, service_role;

-- 3. CẬP NHẬT public.admin_manage_user:
--    - Thu hồi: đặt status = 'revoked', period_end = now(), revoked_at = now(), revoked_reason cho MỌI dòng hiệu lực
--    - Cho phép chọn kèm: xóa hạn mức AI riêng (p_clear_custom_ai_limit, mặc định true) & đánh dấu đơn liên quan là refunded (p_refund_latest_order, mặc định false)
--    - Ghi admin_audit_log (trước/sau) và tạo thông báo "Gói Premium của bạn đã bị thu hồi" kèm lý do
drop function if exists public.admin_manage_user(uuid, text, text, integer);

create or replace function public.admin_manage_user(
  p_target_user_id uuid,
  p_action text,
  p_reason text,
  p_custom_limit integer default null,
  p_clear_custom_ai_limit boolean default true,
  p_refund_latest_order boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_is_system boolean := (coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin', 'service_role'));
  v_vn_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_is_target_admin boolean := false;
  v_before jsonb;
  v_after jsonb;
  v_period_end timestamptz := null;
  v_sub_id uuid := null;
  v_refunded_order_id uuid := null;
  v_revoked_count integer := 0;
begin
  if not v_is_system and not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  if v_admin_id is null then
    select user_id into v_admin_id from public.admins limit 1;
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
    'active_subscriptions', coalesce(
      (
        select jsonb_agg(to_jsonb(s.*) order by s.created_at desc)
        from public.subscriptions s
        where s.user_id = p_target_user_id
          and s.status = 'active'
      ),
      '[]'::jsonb
    ),
    'latest_order', (
      select to_jsonb(o.*)
      from public.orders o
      where o.user_id = p_target_user_id
      order by o.created_at desc
      limit 1
    )
  ) into v_before
  from public.profiles p
  where p.id = p_target_user_id;

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
      v_period_end := now() + make_interval(days => p_custom_limit);
    else
      v_period_end := null;
    end if;

    update public.subscriptions
    set status = 'canceled'
    where user_id = p_target_user_id
      and status = 'active';

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
      raise exception 'Bắt buộc nhập lý do thu hồi gói Premium';
    end if;

    -- Vô hiệu hóa TẤT CẢ dòng subscriptions đang hiệu lực của người dùng
    with revoked_rows as (
      update public.subscriptions
      set status = 'revoked',
          period_end = now(),
          revoked_at = now(),
          revoked_reason = trim(p_reason),
          revoked_by = v_admin_id
      where user_id = p_target_user_id
        and (status = 'active' or (period_end is not null and period_end > now()))
      returning id
    )
    select count(*)::integer into v_revoked_count from revoked_rows;

    -- Tùy chọn 1: xóa hạn mức AI riêng (mặc định true)
    if coalesce(p_clear_custom_ai_limit, true) then
      update public.profiles
      set custom_ai_daily_limit = null
      where id = p_target_user_id;
    end if;

    -- Tùy chọn 2: đánh dấu đơn đã thanh toán gần nhất là refunded
    if coalesce(p_refund_latest_order, false) then
      update public.orders
      set status = 'refunded'
      where id = (
        select id
        from public.orders
        where user_id = p_target_user_id
          and status = 'paid'
        order by coalesce(paid_at, created_at) desc
        limit 1
      )
      returning id into v_refunded_order_id;
    end if;

    -- Gửi thông báo cho người dùng kèm lý do công khai
    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      p_target_user_id,
      'plan_changed',
      'Gói Premium của bạn đã bị thu hồi',
      'Gói Premium của bạn đã bị thu hồi. Lý do: ' || trim(p_reason) || '. Tài khoản đã chuyển về gói Miễn phí, toàn bộ dữ liệu hiện có của bạn vẫn được giữ nguyên an toàn.',
      jsonb_build_object(
        'reason', trim(p_reason),
        'revoked_subscriptions_count', v_revoked_count,
        'cleared_custom_ai_limit', coalesce(p_clear_custom_ai_limit, true),
        'refunded_order_id', v_refunded_order_id
      )
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
      'active_subscriptions', coalesce(
        (
          select jsonb_agg(to_jsonb(s.*) order by s.created_at desc)
          from public.subscriptions s
          where s.user_id = p_target_user_id
            and s.status = 'active'
        ),
        '[]'::jsonb
      ),
      'latest_subscription', (
        select to_jsonb(s.*)
        from public.subscriptions s
        where s.user_id = p_target_user_id
        order by s.created_at desc
        limit 1
      ),
      'latest_order', (
        select to_jsonb(o.*)
        from public.orders o
        where o.user_id = p_target_user_id
        order by o.created_at desc
        limit 1
      )
    ) into v_after
    from public.profiles p
    where p.id = p_target_user_id;
  else
    v_after := jsonb_build_object('deleted', true);
  end if;

  if v_admin_id is not null then
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
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', p_action,
    'revoked_count', v_revoked_count,
    'refunded_order_id', v_refunded_order_id
  );
end;
$$;

grant execute on function public.admin_manage_user(uuid, text, text, integer, boolean, boolean) to authenticated, service_role;

-- 4. CẬP NHẬT public.admin_manage_payment_order (nhánh refund_order đặt status = 'revoked' và period_end = now())
create or replace function public.admin_manage_payment_order(
  p_action text,
  p_order_id uuid default null,
  p_event_id uuid default null,
  p_reason text default null,
  p_revoke_premium boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_event public.payment_events%rowtype;
  v_activation jsonb;
  v_clean_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  if v_clean_reason = '' then
    raise exception 'Vui lòng nhập lý do thực hiện thao tác quản trị';
  end if;

  if p_action = 'confirm_order' then
    if p_order_id is null then
      raise exception 'Thiếu ID đơn hàng cần xác nhận';
    end if;

    v_activation := public.activate_subscription_from_order(
      p_order_id,
      'ADMIN_MANUAL_CONFIRM',
      v_admin_id,
      v_clean_reason
    );

    if p_event_id is not null then
      update public.payment_events
      set status = 'processed',
          order_id = p_order_id,
          reason = 'Admin xác nhận thủ công: ' || v_clean_reason
      where id = p_event_id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'action', p_action,
      'activation', v_activation
    );

  elsif p_action = 'cancel_order' then
    if p_order_id is null then
      raise exception 'Thiếu ID đơn hàng cần hủy';
    end if;

    select * into v_order from public.orders where id = p_order_id for update;
    if not found then
      raise exception 'Không tìm thấy đơn hàng';
    end if;

    if v_order.status = 'paid' then
      raise exception 'Đơn đã thanh toán không thể hủy trực tiếp, vui lòng dùng chức năng Hoàn tiền';
    end if;

    update public.orders
    set status = 'cancelled'
    where id = p_order_id;

    insert into public.admin_audit_log (
      admin_id, action, target_type, target_id, before_state, after_state, reason
    ) values (
      v_admin_id,
      'order_cancel',
      'order',
      p_order_id::text,
      to_jsonb(v_order.*),
      jsonb_build_object('status', 'cancelled'),
      v_clean_reason
    );

    return jsonb_build_object('ok', true, 'action', p_action);

  elsif p_action = 'ignore_event' then
    if p_event_id is null then
      raise exception 'Thiếu ID sự kiện webhook';
    end if;

    select * into v_event from public.payment_events where id = p_event_id for update;
    if not found then
      raise exception 'Không tìm thấy sự kiện thanh toán';
    end if;

    update public.payment_events
    set status = 'ignored',
        reason = 'Admin bỏ qua: ' || v_clean_reason
    where id = p_event_id;

    insert into public.admin_audit_log (
      admin_id, action, target_type, target_id, before_state, after_state, reason
    ) values (
      v_admin_id,
      'payment_event_ignore',
      'payment_event',
      p_event_id::text,
      to_jsonb(v_event.*),
      jsonb_build_object('status', 'ignored', 'reason', 'Admin bỏ qua: ' || v_clean_reason),
      v_clean_reason
    );

    return jsonb_build_object('ok', true, 'action', p_action);

  elsif p_action = 'refund_order' then
    if p_order_id is null then
      raise exception 'Thiếu ID đơn hàng cần hoàn tiền';
    end if;

    select * into v_order from public.orders where id = p_order_id for update;
    if not found then
      raise exception 'Không tìm thấy đơn hàng';
    end if;

    update public.orders
    set status = 'refunded'
    where id = p_order_id;

    if coalesce(p_revoke_premium, false) then
      update public.subscriptions
      set status = 'revoked',
          period_end = now(),
          revoked_at = now(),
          revoked_reason = v_clean_reason,
          revoked_by = v_admin_id
      where user_id = v_order.user_id
        and (status = 'active' or (period_end is not null and period_end > now()));

      insert into public.notifications (user_id, type, title, body, metadata)
      values (
        v_order.user_id,
        'plan_changed',
        'Gói Premium của bạn đã bị thu hồi',
        'Gói Premium của bạn đã bị thu hồi và đơn hàng ' || v_order.payment_code || ' được đánh dấu hoàn tiền (Lý do: ' || v_clean_reason || '). Tài khoản đã chuyển về gói Miễn phí, toàn bộ dữ liệu vẫn được giữ nguyên.',
        jsonb_build_object('order_id', v_order.id, 'payment_code', v_order.payment_code, 'reason', v_clean_reason)
      );
    end if;

    insert into public.admin_audit_log (
      admin_id, action, target_type, target_id, before_state, after_state, reason
    ) values (
      v_admin_id,
      'order_refund',
      'order',
      p_order_id::text,
      to_jsonb(v_order.*),
      jsonb_build_object('status', 'refunded', 'revoked_premium', coalesce(p_revoke_premium, false)),
      v_clean_reason
    );

    return jsonb_build_object('ok', true, 'action', p_action);

  else
    raise exception 'Hành động không hợp lệ: %', p_action;
  end if;
end;
$$;

grant execute on function public.admin_manage_payment_order(text, uuid, uuid, text, boolean) to authenticated;

-- 5. ĐỒNG BỘ LẠI CÁC TÀI KHOẢN ĐÃ BỊ ADMIN THU HỒI NHƯNG BỊ HỒI SINH DO MIGRATION 16
do $$
declare
  r record;
begin
  for r in
    select distinct on (a.target_id)
      a.target_id::uuid as user_id,
      a.admin_id,
      a.reason,
      a.created_at as revoked_time
    from public.admin_audit_log a
    where a.action = 'user_revoke_premium'
      and a.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    order by a.target_id, a.created_at desc
  loop
    -- Nếu sau thời điểm thu hồi KHÔNG có lần admin cấp mới hay đơn hàng mới thanh toán nào
    if not exists (
      select 1 from public.admin_audit_log g
      where g.target_id = r.user_id::text
        and g.action in ('user_grant_premium', 'order_activate_subscription')
        and g.created_at > r.revoked_time
    ) and not exists (
      select 1 from public.orders o
      where o.user_id = r.user_id
        and o.status = 'paid'
        and coalesce(o.paid_at, o.created_at) > r.revoked_time
    ) then
      update public.subscriptions
      set status = 'revoked',
          period_end = r.revoked_time,
          revoked_at = r.revoked_time,
          revoked_reason = coalesce(r.reason, 'Thu hồi bởi quản trị viên'),
          revoked_by = r.admin_id
      where user_id = r.user_id
        and (status in ('active', 'canceled') or (period_end is not null and period_end > now()));

      update public.profiles
      set custom_ai_daily_limit = null
      where id = r.user_id;
    end if;
  end loop;
end;
$$;

-- 6. CẬP NHẬT public.debug_check_user_entitlements IN TẤT CẢ DÒNG SUBSCRIPTIONS & AUDIT
create or replace function public.debug_check_user_entitlements(
  p_email_or_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text := trim(coalesce(p_email_or_id, ''));
  v_user_id uuid := null;
  v_email text := null;
  v_profile jsonb := null;
  v_latest_order jsonb := null;
  v_active_sub jsonb := null;
  v_all_subs jsonb := '[]'::jsonb;
  v_recent_audits jsonb := '[]'::jsonb;
  v_recent_notifs jsonb := '[]'::jsonb;
  v_entitlements jsonb := null;
  v_ai_today integer := 0;
  v_set_count integer := 0;
  v_storage_bytes bigint := 0;
  v_today_vn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if v_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id, email into v_user_id, v_email
    from auth.users
    where id = v_target::uuid;
  elsif v_target != '' then
    select id, email into v_user_id, v_email
    from auth.users
    where lower(email) = lower(v_target)
    limit 1;
  else
    select u.id, u.email into v_user_id, v_email
    from public.orders o
    join auth.users u on u.id = o.user_id
    order by o.created_at desc
    limit 1;

    if v_user_id is null then
      select id, email into v_user_id, v_email
      from auth.users
      order by created_at desc
      limit 1;
    end if;
  end if;

  if v_user_id is null then
    return jsonb_build_object(
      'found', false,
      'target', v_target
    );
  end if;

  select to_jsonb(p.*) into v_profile
  from public.profiles p
  where p.id = v_user_id;

  select to_jsonb(o.*) into v_latest_order
  from (
    select *
    from public.orders
    where user_id = v_user_id
    order by created_at desc
    limit 1
  ) o;

  select coalesce(jsonb_agg(to_jsonb(s.*) order by s.created_at desc), '[]'::jsonb)
  into v_all_subs
  from public.subscriptions s
  where s.user_id = v_user_id;

  select to_jsonb(s.*) into v_active_sub
  from (
    select *
    from public.subscriptions
    where user_id = v_user_id
      and status = 'active'
      and revoked_at is null
      and (period_end is null or period_end > now())
    order by (plan_code = 'premium') desc, created_at desc
    limit 1
  ) s;

  select coalesce(jsonb_agg(to_jsonb(a.*) order by a.created_at desc), '[]'::jsonb)
  into v_recent_audits
  from (
    select id, admin_id, action, reason, created_at
    from public.admin_audit_log
    where target_id = v_user_id::text
    order by created_at desc
    limit 5
  ) a;

  select coalesce(jsonb_agg(to_jsonb(n.*) order by n.created_at desc), '[]'::jsonb)
  into v_recent_notifs
  from (
    select id, type, title, body, created_at
    from public.notifications
    where user_id = v_user_id
    order by created_at desc
    limit 5
  ) n;

  v_entitlements := public.get_entitlements(v_user_id);

  select coalesce(calls, 0) into v_ai_today
  from public.ai_usage
  where user_id = v_user_id
    and date = v_today_vn;

  select count(*)::integer into v_set_count
  from public.question_sets
  where owner_id = v_user_id;

  select coalesce(sum(sf.file_size_bytes), 0)::bigint into v_storage_bytes
  from public.source_files sf
  join public.question_sets qs on qs.id = sf.set_id
  where qs.owner_id = v_user_id;

  return jsonb_build_object(
    'found', true,
    'user_id', v_user_id,
    'email', v_email,
    'profile', v_profile,
    'latest_order', v_latest_order,
    'active_subscription', v_active_sub,
    'all_subscriptions', v_all_subs,
    'recent_audits', v_recent_audits,
    'recent_notifications', v_recent_notifs,
    'entitlements', v_entitlements,
    'usage', jsonb_build_object(
      'today_vn', v_today_vn,
      'ai_calls_today', v_ai_today,
      'set_count', v_set_count,
      'storage_bytes', v_storage_bytes
    )
  );
end;
$$;

grant execute on function public.debug_check_user_entitlements(text) to anon, authenticated, service_role;

-- 7. DỌN DẸP IDEMPOTENT CÁC DÒNG SUBSCRIPTION BỊ HỒI SINH TỰ ĐỘNG SAU KHI ADMIN ĐÃ THU HỒI (REVOKE_PREMIUM)
do $$
declare
  r record;
begin
  for r in
    select distinct on (a.target_id)
      a.target_id::uuid as user_id,
      a.action,
      a.reason,
      a.created_at as audit_at,
      a.admin_id
    from public.admin_audit_log a
    where a.action in ('revoke_premium', 'grant_premium', 'manual_confirm_order')
      and a.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    order by a.target_id, a.created_at desc
  loop
    if r.action = 'revoke_premium' then
      -- Nếu sau thời điểm revoke không có đơn paid mới nào phát sinh thì thu hồi toàn bộ dòng subscription bị tự sinh lại
      if not exists (
        select 1
        from public.orders o
        where o.user_id = r.user_id
          and o.status = 'paid'
          and coalesce(o.paid_at, o.created_at) > r.audit_at
      ) then
        update public.subscriptions
        set status = 'revoked',
            period_end = r.audit_at,
            revoked_at = coalesce(revoked_at, r.audit_at),
            revoked_reason = coalesce(revoked_reason, r.reason),
            revoked_by = coalesce(revoked_by, r.admin_id)
        where user_id = r.user_id
          and status in ('active', 'canceled');
      end if;
    end if;
  end loop;
end;
$$;
