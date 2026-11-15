-- ============================================================================
-- MemoQuiz - Bước 13 (Bản vá lỗi nghiêm trọng sau Bước 13):
-- 1. Sửa lỗi gốc Postgres 55000 (record "v_latest_prem" is not assigned yet)
--    trong public.get_entitlements khi người dùng có gói Premium đang active.
-- 2. Tự động điền giá trị mặc định an toàn của gói Free cho mọi khóa bị thiếu
--    trong plans.limits (không bao giờ trả null gây lỗi so sánh).
-- 3. Đồng bộ idempotent mọi đơn hàng đã thanh toán (status = 'paid') sang
--    bảng public.subscriptions với đúng thời hạn (không cộng trùng ngày).
-- 4. Bổ sung hàm chẩn đoán public.debug_check_user_entitlements phục vụ
--    script `npm run db:check -- <email>`.
-- ============================================================================

-- 0. Đảm bảo cột file_size_bytes trên source_files và quyền SELECT trên các bảng gói
alter table public.source_files
  add column if not exists file_size_bytes bigint not null default 0;

grant select on public.plans to anon, authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.orders to authenticated;
grant select on public.notifications to authenticated;

-- 1. Bổ sung các khóa còn thiếu trong public.plans (giữ nguyên giá & cấu hình hiện có)
update public.plans
set
  limits = jsonb_build_object(
    'max_sets', coalesce((limits->>'max_sets')::integer, 3),
    'ai_daily', coalesce((limits->>'ai_daily')::integer, (limits->>'ai_daily_limit')::integer, 10),
    'ai_daily_limit', coalesce((limits->>'ai_daily')::integer, (limits->>'ai_daily_limit')::integer, 10),
    'max_file_mb', coalesce((limits->>'max_file_mb')::integer, 10),
    'max_pdf_pages', coalesce((limits->>'max_pdf_pages')::integer, 30),
    'storage_mb', coalesce((limits->>'storage_mb')::integer, 50),
    'max_print_versions', coalesce((limits->>'max_print_versions')::integer, (limits->>'max_export_versions')::integer, 4),
    'max_export_versions', coalesce((limits->>'max_print_versions')::integer, (limits->>'max_export_versions')::integer, 4),
    'can_export_docx', coalesce((limits->>'can_export_docx')::boolean, false),
    'max_questions_per_set', null,
    'max_sets_per_day', null
  ),
  prices = coalesce(prices, '{}'::jsonb),
  period_days = coalesce(period_days, '{}'::jsonb)
where code = 'free';

update public.plans
set
  limits = jsonb_build_object(
    'max_sets', coalesce((limits->>'max_sets')::integer, 100),
    'ai_daily', coalesce((limits->>'ai_daily')::integer, (limits->>'ai_daily_limit')::integer, 50),
    'ai_daily_limit', coalesce((limits->>'ai_daily')::integer, (limits->>'ai_daily_limit')::integer, 50),
    'max_file_mb', coalesce((limits->>'max_file_mb')::integer, 20),
    'max_pdf_pages', coalesce((limits->>'max_pdf_pages')::integer, 60),
    'storage_mb', coalesce((limits->>'storage_mb')::integer, 500),
    'max_print_versions', coalesce((limits->>'max_print_versions')::integer, (limits->>'max_export_versions')::integer, 8),
    'max_export_versions', coalesce((limits->>'max_print_versions')::integer, (limits->>'max_export_versions')::integer, 8),
    'can_export_docx', coalesce((limits->>'can_export_docx')::boolean, true),
    'max_questions_per_set', null,
    'max_sets_per_day', null
  ),
  prices = case
    when prices is null or prices = '{}'::jsonb then '{"month": 39000, "year": 299000}'::jsonb
    else prices
  end,
  period_days = case
    when period_days is null or period_days = '{}'::jsonb then '{"month": 30, "year": 365}'::jsonb
    else period_days
  end
where code = 'premium';

-- 2. CẬP NHẬT HÀM activate_subscription_from_order (tránh truy cập biến record chưa gán)
create or replace function public.activate_subscription_from_order(
  p_order_id uuid,
  p_provider_ref text default null,
  p_actor_admin_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_plan public.plans%rowtype;
  v_active_sub public.subscriptions%rowtype;
  v_has_active_sub boolean := false;
  v_prev_period_end timestamptz := null;
  v_days integer := 30;
  v_base_time timestamptz := now();
  v_new_period_end timestamptz;
  v_new_sub_id uuid;
  v_is_webhook boolean := (coalesce(current_setting('app.webhook_context', true), '') = 'sepay_verified');
  v_is_system boolean := (coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin', 'service_role'));
  v_actor_admin uuid := coalesce(p_actor_admin_id, case when public.is_admin() then auth.uid() else null end);
begin
  if not v_is_webhook and not v_is_system and not public.is_admin() then
    raise exception 'Unauthorized: Only payment webhook or admin can activate orders' using errcode = '42501';
  end if;

  if p_order_id is null then
    raise exception 'Order ID is required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'status', 'order_not_found'
    );
  end if;

  -- Idempotent: nếu đơn đã 'paid' VÀ người dùng đã có gói active còn hạn thì trả về ngay, không cộng trùng ngày
  if v_order.status = 'paid' then
    select * into v_active_sub
    from public.subscriptions
    where user_id = v_order.user_id
      and plan_code = v_order.plan_code
      and status = 'active'
      and (period_end is null or period_end > now())
    order by created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'status', 'already_paid',
        'order_id', v_order.id,
        'subscription_id', v_active_sub.id,
        'period_end', v_active_sub.period_end,
        'paid_at', v_order.paid_at
      );
    end if;
  end if;

  if v_order.status in ('cancelled', 'refunded') then
    return jsonb_build_object(
      'ok', false,
      'status', 'not_activatable',
      'order_status', v_order.status,
      'order_id', v_order.id
    );
  end if;

  select * into v_plan
  from public.plans
  where code = v_order.plan_code;

  v_days := greatest(
    1,
    coalesce(
      (v_plan.period_days->>v_order.period)::integer,
      case when v_order.period = 'year' then 365 else 30 end
    )
  );

  select * into v_active_sub
  from public.subscriptions
  where user_id = v_order.user_id
    and plan_code = v_order.plan_code
    and status = 'active'
    and (period_end is null or period_end > now())
  order by created_at desc
  limit 1
  for update;

  if found then
    v_has_active_sub := true;
    v_prev_period_end := v_active_sub.period_end;
    if v_active_sub.period_end is null then
      v_new_period_end := null;
    else
      v_base_time := greatest(v_active_sub.period_end, now());
      v_new_period_end := v_base_time + make_interval(days => v_days);
    end if;
  else
    v_base_time := coalesce(v_order.paid_at, now());
    if v_base_time + make_interval(days => v_days) <= now() then
      v_base_time := now();
    end if;
    v_new_period_end := v_base_time + make_interval(days => v_days);
  end if;

  update public.subscriptions
  set status = 'canceled'
  where user_id = v_order.user_id
    and status = 'active';

  update public.orders
  set status = 'paid',
      paid_at = coalesce(paid_at, now()),
      provider_ref = coalesce(p_provider_ref, provider_ref)
  where id = v_order.id;

  insert into public.subscriptions (
    user_id,
    plan_code,
    status,
    period_end,
    source,
    granted_by
  ) values (
    v_order.user_id,
    v_order.plan_code,
    'active',
    v_new_period_end,
    coalesce(v_order.provider, 'sepay'),
    v_actor_admin
  )
  returning id into v_new_sub_id;

  begin
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      metadata,
      dedupe_key
    ) values (
      v_order.user_id,
      'payment_confirmed',
      'Thanh toán thành công gói ' || coalesce(v_plan.name, 'Premium'),
      'Đơn hàng ' || v_order.payment_code || ' (' || to_char(v_order.amount, 'FM999,999,999') || 'đ) đã được xác nhận. Gói ' ||
      coalesce(v_plan.name, 'Premium') || ' của bạn có hiệu lực đến ' ||
      coalesce(to_char(v_new_period_end at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI'), 'vĩnh viễn') || '.',
      jsonb_build_object(
        'order_id', v_order.id,
        'payment_code', v_order.payment_code,
        'amount', v_order.amount,
        'period', v_order.period,
        'subscription_id', v_new_sub_id,
        'period_end', v_new_period_end
      ),
      'order_paid_' || v_order.id::text
    )
    on conflict (user_id, dedupe_key) where dedupe_key is not null
    do nothing;
  exception when others then
    null;
  end;

  if v_actor_admin is not null then
    begin
      insert into public.admin_audit_log (
        admin_id,
        action,
        target_type,
        target_id,
        before_state,
        after_state,
        reason
      ) values (
        v_actor_admin,
        'order_activate_subscription',
        'order',
        v_order.id::text,
        jsonb_build_object('status', v_order.status, 'previous_period_end', v_prev_period_end, 'had_active_sub', v_has_active_sub),
        jsonb_build_object('status', 'paid', 'subscription_id', v_new_sub_id, 'new_period_end', v_new_period_end),
        coalesce(p_reason, 'Kích hoạt gói từ đơn hàng ' || v_order.payment_code)
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', 'activated',
    'order_id', v_order.id,
    'subscription_id', v_new_sub_id,
    'period_end', v_new_period_end,
    'days_added', v_days
  );
end;
$$;

grant execute on function public.activate_subscription_from_order(uuid, text, uuid, text) to authenticated, service_role;

-- 3. SỬA HÀM public.get_entitlements:
--    - Xóa bỏ hoàn toàn biến `record` không định kiểu (nguyên nhân gây lỗi 55000: record "v_latest_prem" is not assigned yet)
--    - Tự động đồng bộ đơn `paid` còn hạn nếu chưa có dòng `subscriptions` active
--    - Điền mặc định an toàn của gói Free cho bất kỳ khóa nào thiếu trong `limits`
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
  v_expired_id uuid := null;
  v_expired_status text := null;
  v_expired_period_end timestamptz := null;
  v_paid_order_id uuid := null;
  v_paid_order_plan text := null;
  v_paid_order_period text := null;
  v_paid_order_provider text := null;
  v_paid_order_time timestamptz := null;
  v_order_days integer := 30;
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

  -- 2. Kiểm tra subscription đang hoạt động và còn hạn
  select id, plan_code, status, period_end, source
  into v_sub_id, v_sub_plan_code, v_sub_status, v_sub_period_end, v_sub_source
  from public.subscriptions
  where user_id = v_uid
    and status = 'active'
    and (period_end is null or period_end > now())
  order by (plan_code = 'premium') desc, created_at desc
  limit 1;

  -- 2b. Tự động đồng bộ nếu người dùng có đơn hàng đã thanh toán (status = 'paid') còn hạn nhưng chưa có dòng subscription active
  if v_sub_id is null then
    select id, plan_code, period, coalesce(provider, 'sepay'), coalesce(paid_at, created_at)
    into v_paid_order_id, v_paid_order_plan, v_paid_order_period, v_paid_order_provider, v_paid_order_time
    from public.orders
    where user_id = v_uid
      and status = 'paid'
    order by coalesce(paid_at, created_at) desc
    limit 1;

    if v_paid_order_id is not null and v_paid_order_plan is not null then
      select greatest(
        1,
        coalesce(
          (period_days->>v_paid_order_period)::integer,
          case when v_paid_order_period = 'year' then 365 else 30 end
        )
      )
      into v_order_days
      from public.plans
      where code = v_paid_order_plan;

      v_order_days := coalesce(v_order_days, case when v_paid_order_period = 'year' then 365 else 30 end);

      if v_paid_order_time + make_interval(days => v_order_days) > now() then
        v_sub_period_end := v_paid_order_time + make_interval(days => v_order_days);
        v_sub_plan_code := v_paid_order_plan;
        v_sub_status := 'active';
        v_sub_source := v_paid_order_provider;

        begin
          insert into public.subscriptions (
            user_id,
            plan_code,
            status,
            period_end,
            source
          ) values (
            v_uid,
            v_sub_plan_code,
            'active',
            v_sub_period_end,
            v_sub_source
          )
          returning id into v_sub_id;
        exception when others then
          null;
        end;
      end if;
    end if;
  end if;

  if v_sub_plan_code is not null then
    v_plan_code := v_sub_plan_code;

    -- Kiểm tra mốc sắp hết hạn (7 ngày và 1 ngày) cho gói Premium có thời hạn
    if v_plan_code = 'premium' and v_sub_period_end is not null and v_sub_id is not null then
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
    v_plan_code := 'free';

    -- Kiểm tra xem có gói Premium nào vừa hết hạn chưa thông báo không
    select id, status, period_end
    into v_expired_id, v_expired_status, v_expired_period_end
    from public.subscriptions
    where user_id = v_uid
      and plan_code = 'premium'
      and period_end is not null
      and period_end <= now()
    order by period_end desc
    limit 1;

    if v_expired_id is not null then
      if v_expired_status = 'active' then
        update public.subscriptions
        set status = 'expired'
        where id = v_expired_id;
      end if;

      begin
        insert into public.notifications (user_id, type, title, body, metadata, dedupe_key)
        values (
          v_uid,
          'plan_expired',
          'Gói Premium đã hết hạn',
          'Gói Premium của bạn đã hết hạn và tài khoản chuyển về gói Miễn phí. Toàn bộ bộ câu hỏi, bài kiểm tra và lịch ôn tập của bạn vẫn được giữ nguyên an toàn.',
          jsonb_build_object('subscription_id', v_expired_id, 'period_end', v_expired_period_end),
          'sub_expired_' || v_expired_id::text
        )
        on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      exception when others then
        null;
      end;
    end if;
  end if;

  -- 3. Lấy thông tin limits, prices, period_days của gói
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

  -- 4. Chuẩn hóa mọi khóa trong limits: nếu thiếu khóa thì dùng mặc định an toàn của gói Free (không để null)
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
    'status', coalesce(v_sub_status, case when v_expired_id is not null then 'expired' else 'active' end),
    'period_end', coalesce(v_sub_period_end, v_expired_period_end),
    'source', coalesce(v_sub_source, 'default'),
    'limits', v_result_limits,
    'prices', coalesce(v_plan_prices, '{}'::jsonb),
    'period_days', coalesce(v_plan_period_days, '{}'::jsonb),
    'custom_ai_daily_limit', v_custom_limit
  );
end;
$$;

grant execute on function public.get_entitlements(uuid) to authenticated, anon, service_role;

-- 4. ĐỒNG BỘ IDEMPOTENT DỮ LIỆU ĐƠN ĐÃ THANH TOÁN (status = 'paid') CHƯA CÓ SUBSCRIPTION ACTIVE
do $$
declare
  r record;
  v_days integer;
  v_calc_end timestamptz;
  v_existing_sub_id uuid;
begin
  for r in
    select distinct on (o.user_id)
      o.id as order_id,
      o.user_id,
      o.plan_code,
      o.period,
      o.amount,
      o.payment_code,
      coalesce(o.provider, 'sepay') as provider,
      coalesce(o.paid_at, o.created_at) as effective_paid_at
    from public.orders o
    where o.status = 'paid'
    order by o.user_id, coalesce(o.paid_at, o.created_at) desc
  loop
    select greatest(
      1,
      coalesce(
        (p.period_days->>r.period)::integer,
        case when r.period = 'year' then 365 else 30 end
      )
    )
    into v_days
    from public.plans p
    where p.code = r.plan_code;

    v_days := coalesce(v_days, case when r.period = 'year' then 365 else 30 end);
    v_calc_end := r.effective_paid_at + make_interval(days => v_days);

    if v_calc_end > now() then
      select s.id into v_existing_sub_id
      from public.subscriptions s
      where s.user_id = r.user_id
        and s.plan_code = r.plan_code
        and s.status = 'active'
        and (s.period_end is null or s.period_end > now())
      limit 1;

      if v_existing_sub_id is null then
        insert into public.subscriptions (
          user_id,
          plan_code,
          status,
          period_end,
          source
        ) values (
          r.user_id,
          r.plan_code,
          'active',
          v_calc_end,
          r.provider
        );
      end if;
    end if;
  end loop;
end;
$$;

-- 5. HÀM CHẨN ĐOÁN DÀNH CHO SCRIPT SERVER (`npm run db:check -- <email>`)
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
  v_entitlements jsonb := null;
  v_ai_today integer := 0;
  v_set_count integer := 0;
  v_storage_bytes bigint := 0;
  v_today_vn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  -- Tìm theo UUID hoặc email trong auth.users, hoặc lấy người dùng có đơn hàng gần nhất
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

  select to_jsonb(s.*) into v_active_sub
  from (
    select *
    from public.subscriptions
    where user_id = v_user_id
      and status = 'active'
    order by created_at desc
    limit 1
  ) s;

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

