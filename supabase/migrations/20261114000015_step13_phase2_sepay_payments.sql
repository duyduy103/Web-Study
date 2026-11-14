-- ============================================================================
-- MemoQuiz - Bước 13 (Giai đoạn 2): Thanh toán tự động bằng SePay (VietQR + Webhook)
-- ============================================================================

-- 1. BẢNG ORDERS (Đơn thanh toán gói dịch vụ)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.plans(code),
  period text not null check (period in ('month', 'year')),
  amount integer not null check (amount > 0),
  currency text not null default 'VND',
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
  provider text not null default 'sepay',
  provider_ref text,
  payment_code text not null unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  expires_at timestamptz not null default (now() + interval '48 hours')
);

create index if not exists idx_orders_user_status_created
  on public.orders (user_id, status, created_at desc);

create index if not exists idx_orders_payment_code
  on public.orders (payment_code);

create index if not exists idx_orders_status_paid_at
  on public.orders (status, paid_at desc);

alter table public.orders enable row level security;

drop policy if exists "Users can read own orders or admin read all" on public.orders;
create policy "Users can read own orders or admin read all"
  on public.orders
  for select
  using (user_id = auth.uid() or public.is_admin());

-- 2. BẢNG PAYMENT_EVENTS (Sự kiện webhook từ cổng thanh toán, chống xử lý trùng)
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'sepay',
  event_id text not null,
  status text not null check (status in ('processed', 'needs_review', 'ignored')),
  reason text,
  order_id uuid references public.orders(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint uq_payment_events_provider_event_id unique (provider, event_id)
);

create index if not exists idx_payment_events_status_created
  on public.payment_events (status, created_at desc);

alter table public.payment_events enable row level security;

drop policy if exists "Admins can read payment events" on public.payment_events;
create policy "Admins can read payment events"
  on public.payment_events
  for select
  using (public.is_admin());

-- 3. HÀM KÍCH HOẠT GÓI TỪ ĐƠN HÀNG (activate_subscription_from_order)
-- SECURITY DEFINER, atomic (khóa dòng FOR UPDATE) và idempotent:
-- - Chỉ kích hoạt khi đơn đang 'pending' hoặc 'expired' (tiền đã vào vẫn tính là đã trả)
-- - KHÔNG kích hoạt đơn 'cancelled' hoặc 'refunded'
-- - Gọi lại nhiều lần trên đơn 'paid' không cộng thêm ngày
-- - Gia hạn nối tiếp từ period_end hiện tại nếu đang có Premium còn hạn
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
  v_days integer := 30;
  v_base_time timestamptz := now();
  v_new_period_end timestamptz;
  v_new_sub_id uuid;
  v_is_webhook boolean := (coalesce(current_setting('app.webhook_context', true), '') = 'sepay_verified');
  v_is_system boolean := (coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin', 'service_role'));
  v_actor_admin uuid := coalesce(p_actor_admin_id, case when public.is_admin() then auth.uid() else null end);
begin
  -- Chỉ cho phép gọi từ webhook đã xác thực, Admin, hoặc SQL Editor / service_role
  if not v_is_webhook and not v_is_system and not public.is_admin() then
    raise exception 'Unauthorized: Only payment webhook or admin can activate orders' using errcode = '42501';
  end if;

  if p_order_id is null then
    raise exception 'Order ID is required';
  end if;

  -- Khóa dòng đơn hàng để đảm bảo tính nguyên tử (atomic)
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

  -- Idempotent: nếu đơn đã 'paid', trả về ngay và KHÔNG cộng thêm ngày
  if v_order.status = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', 'already_paid',
      'order_id', v_order.id,
      'paid_at', v_order.paid_at
    );
  end if;

  -- Không kích hoạt đơn đã hủy hoặc đã hoàn tiền
  if v_order.status in ('cancelled', 'refunded') then
    return jsonb_build_object(
      'ok', false,
      'status', 'not_activatable',
      'order_status', v_order.status,
      'order_id', v_order.id
    );
  end if;

  -- Lấy cấu hình số ngày của gói từ bảng plans.period_days
  select * into v_plan
  from public.plans
  where code = v_order.plan_code;

  v_days := coalesce(
    (v_plan.period_days->>v_order.period)::integer,
    case when v_order.period = 'year' then 365 else 30 end
  );

  -- Kiểm tra gói Premium đang hoạt động của người dùng để gia hạn nối tiếp
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
    if v_active_sub.period_end is null then
      -- Đang là gói vĩnh viễn thì giữ nguyên không thời hạn
      v_new_period_end := null;
    else
      -- Gia hạn nối tiếp từ period_end hiện tại
      v_base_time := greatest(v_active_sub.period_end, now());
      v_new_period_end := v_base_time + (v_days || ' days')::interval;
    end if;

    update public.subscriptions
    set status = 'canceled'
    where user_id = v_order.user_id
      and status = 'active';
  else
    v_base_time := now();
    v_new_period_end := v_base_time + (v_days || ' days')::interval;

    update public.subscriptions
    set status = 'canceled'
    where user_id = v_order.user_id
      and status = 'active';
  end if;

  -- Cập nhật trạng thái đơn sang 'paid'
  update public.orders
  set status = 'paid',
      paid_at = now(),
      provider_ref = coalesce(p_provider_ref, provider_ref)
  where id = v_order.id;

  -- Tạo bản ghi subscription mới với source = order.provider
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

  -- Tạo thông báo trong ứng dụng (chống trùng theo order_id)
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

  -- Ghi nhật ký admin_audit_log nếu có admin thực hiện (hoặc xác nhận thủ công)
  if v_actor_admin is not null then
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
      jsonb_build_object('status', v_order.status, 'previous_period_end', v_active_sub.period_end),
      jsonb_build_object('status', 'paid', 'subscription_id', v_new_sub_id, 'new_period_end', v_new_period_end),
      coalesce(p_reason, 'Kích hoạt gói từ đơn hàng ' || v_order.payment_code)
    );
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

grant execute on function public.activate_subscription_from_order(uuid, text, uuid, text) to authenticated;

-- 4. HÀM TẠO HOẶC DÙNG LẠI ĐƠN PENDING (create_or_reuse_payment_order)
-- - Tự động hết hạn các đơn pending quá 48 giờ
-- - Mỗi người chỉ có tối đa 1 đơn pending cho cùng gói/chu kỳ (tạo lại thì dùng lại đơn cũ chưa hết hạn)
-- - Giá do server tự tính từ plans.prices, không nhận số tiền từ client
create or replace function public.create_or_reuse_payment_order(
  p_plan_code text,
  p_period text,
  p_payment_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_existing public.orders%rowtype;
  v_created public.orders%rowtype;
  v_price integer;
  v_clean_code text := upper(trim(coalesce(p_payment_code, '')));
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  if p_period is null or p_period not in ('month', 'year') then
    raise exception 'Chu kỳ thanh toán không hợp lệ (chỉ hỗ trợ month hoặc year)';
  end if;

  -- Tự động chuyển các đơn pending đã quá 48 giờ sang expired
  update public.orders
  set status = 'expired'
  where user_id = v_user_id
    and status = 'pending'
    and expires_at <= now();

  -- Kiểm tra đơn pending còn hạn của cùng gói và chu kỳ
  select * into v_existing
  from public.orders
  where user_id = v_user_id
    and plan_code = p_plan_code
    and period = p_period
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'order', to_jsonb(v_existing.*),
      'reused', true
    );
  end if;

  -- Lấy giá từ bảng plans.prices (server-side)
  select * into v_plan
  from public.plans
  where code = p_plan_code
    and active = true;

  if not found then
    raise exception 'Gói dịch vụ không tồn tại hoặc đang tạm ngưng';
  end if;

  v_price := (v_plan.prices->>p_period)::integer;
  if v_price is null or v_price <= 0 then
    raise exception 'Gói dịch vụ này không có mức giá cho chu kỳ đã chọn';
  end if;

  if v_clean_code = '' or v_clean_code !~ '^[A-Z0-9]{6,32}$' then
    raise exception 'Mã thanh toán không hợp lệ';
  end if;

  insert into public.orders (
    user_id,
    plan_code,
    period,
    amount,
    currency,
    status,
    provider,
    payment_code,
    expires_at
  ) values (
    v_user_id,
    p_plan_code,
    p_period,
    v_price,
    'VND',
    'pending',
    'sepay',
    v_clean_code,
    now() + interval '48 hours'
  )
  returning * into v_created;

  return jsonb_build_object(
    'order', to_jsonb(v_created.*),
    'reused', false
  );
end;
$$;

grant execute on function public.create_or_reuse_payment_order(text, text, text) to authenticated;

-- 5. HÀM LẤY TRẠNG THÁI ĐƠN HÀNG & HỦY ĐƠN PENDING CHO NGƯỜI DÙNG
create or replace function public.get_my_order_status(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  -- Tự động hết hạn nếu đã quá 48 giờ
  update public.orders
  set status = 'expired'
  where id = p_order_id
    and status = 'pending'
    and expires_at <= now();

  select * into v_order
  from public.orders
  where id = p_order_id
    and (user_id = v_user_id or public.is_admin());

  if not found then
    return null;
  end if;

  return to_jsonb(v_order.*);
end;
$$;

grant execute on function public.get_my_order_status(uuid) to authenticated;

create or replace function public.cancel_my_pending_order(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  update public.orders
  set status = 'cancelled'
  where id = p_order_id
    and user_id = v_user_id
    and status = 'pending'
  returning * into v_order;

  if not found then
    raise exception 'Không thể hủy đơn hàng này (đơn không tồn tại hoặc không còn ở trạng thái chờ thanh toán)';
  end if;

  return to_jsonb(v_order.*);
end;
$$;

grant execute on function public.cancel_my_pending_order(uuid) to authenticated;

-- 6. HÀM XỬ LÝ SỰ KIỆN WEBHOOK SEPAY (process_sepay_webhook_event)
-- Chống xử lý trùng bằng unique(provider, event_id), kiểm tra transferType='in',
-- đối chiếu số tiền và trạng thái đơn, tự kích hoạt hoặc đưa vào 'needs_review'
create or replace function public.process_sepay_webhook_event(
  p_event_id text,
  p_transfer_type text,
  p_transfer_amount integer,
  p_payment_code text default null,
  p_reference_code text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean_event_id text := trim(coalesce(p_event_id, ''));
  v_clean_code text := upper(trim(coalesce(p_payment_code, '')));
  v_order public.orders%rowtype;
  v_inserted_event_id uuid := null;
  v_activation jsonb;
begin
  if v_clean_event_id = '' then
    raise exception 'event_id is required';
  end if;

  -- 1. Kiểm tra chống xử lý trùng (idempotency theo provider + event_id)
  if exists (
    select 1 from public.payment_events
    where provider = 'sepay' and event_id = v_clean_event_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'status', 'duplicate'
    );
  end if;

  -- 2. Chỉ xử lý giao dịch tiền vào (transferType = 'in')
  if lower(trim(coalesce(p_transfer_type, ''))) != 'in' then
    insert into public.payment_events (provider, event_id, status, reason, payload)
    values (
      'sepay',
      v_clean_event_id,
      'ignored',
      'Giao dịch tiền ra (transferType != in)',
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (provider, event_id) do nothing;

    return jsonb_build_object(
      'ok', true,
      'duplicate', false,
      'status', 'ignored',
      'reason', 'transfer_out'
    );
  end if;

  -- 3. Nếu không tách được payment_code -> ghi needs_review
  if v_clean_code = '' then
    insert into public.payment_events (provider, event_id, status, reason, payload)
    values (
      'sepay',
      v_clean_event_id,
      'needs_review',
      'Không tìm thấy mã thanh toán trong nội dung chuyển khoản',
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (provider, event_id) do nothing;

    return jsonb_build_object(
      'ok', true,
      'duplicate', false,
      'status', 'needs_review',
      'reason', 'missing_payment_code'
    );
  end if;

  -- Tự động đánh dấu expired cho đơn quá 48h trước khi kiểm tra (đơn expired vẫn được kích hoạt nếu tiền về đủ)
  update public.orders
  set status = 'expired'
  where payment_code = v_clean_code
    and status = 'pending'
    and expires_at <= now();

  -- 4. Tìm đơn hàng theo payment_code
  select * into v_order
  from public.orders
  where payment_code = v_clean_code
  for update;

  if not found then
    insert into public.payment_events (provider, event_id, status, reason, payload)
    values (
      'sepay',
      v_clean_event_id,
      'needs_review',
      'Không tìm thấy đơn hàng khớp mã ' || v_clean_code,
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (provider, event_id) do nothing;

    return jsonb_build_object(
      'ok', true,
      'duplicate', false,
      'status', 'needs_review',
      'reason', 'order_not_found'
    );
  end if;

  -- 5. Kiểm tra trạng thái đơn hàng
  if v_order.status = 'paid' then
    insert into public.payment_events (provider, event_id, status, reason, order_id, payload)
    values (
      'sepay',
      v_clean_event_id,
      'needs_review',
      'Đơn hàng ' || v_order.payment_code || ' đã ở trạng thái đã thanh toán trước đó',
      v_order.id,
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (provider, event_id) do nothing;

    return jsonb_build_object(
      'ok', true,
      'duplicate', false,
      'status', 'needs_review',
      'reason', 'order_already_paid'
    );
  end if;

  if v_order.status in ('cancelled', 'refunded') then
    insert into public.payment_events (provider, event_id, status, reason, order_id, payload)
    values (
      'sepay',
      v_clean_event_id,
      'needs_review',
      'Đơn hàng ' || v_order.payment_code || ' đang ở trạng thái ' || v_order.status || ' (không tự kích hoạt)',
      v_order.id,
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (provider, event_id) do nothing;

    return jsonb_build_object(
      'ok', true,
      'duplicate', false,
      'status', 'needs_review',
      'reason', 'order_not_activatable'
    );
  end if;

  -- 6. Kiểm tra khớp chính xác số tiền
  if coalesce(p_transfer_amount, 0) != v_order.amount then
    insert into public.payment_events (provider, event_id, status, reason, order_id, payload)
    values (
      'sepay',
      v_clean_event_id,
      'needs_review',
      'Sai số tiền chuyển khoản: nhận ' || coalesce(p_transfer_amount, 0)::text || 'đ, đơn yêu cầu ' || v_order.amount::text || 'đ',
      v_order.id,
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (provider, event_id) do nothing;

    return jsonb_build_object(
      'ok', true,
      'duplicate', false,
      'status', 'needs_review',
      'reason', 'amount_mismatch'
    );
  end if;

  -- 7. Đủ điều kiện kích hoạt (pending hoặc expired + đúng số tiền)
  insert into public.payment_events (provider, event_id, status, reason, order_id, payload)
  values (
    'sepay',
    v_clean_event_id,
    'processed',
    'Khớp tự động đơn hàng ' || v_order.payment_code,
    v_order.id,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, event_id) do nothing
  returning id into v_inserted_event_id;

  if v_inserted_event_id is null then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'status', 'duplicate'
    );
  end if;

  perform set_config('app.webhook_context', 'sepay_verified', true);
  v_activation := public.activate_subscription_from_order(
    v_order.id,
    coalesce(nullif(trim(coalesce(p_reference_code, '')), ''), v_clean_event_id),
    null,
    'Thanh toán tự động qua SePay (' || v_clean_event_id || ')'
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'status', 'processed',
    'order_id', v_order.id,
    'activation', v_activation
  );
end;
$$;

grant execute on function public.process_sepay_webhook_event(text, text, integer, text, text, jsonb) to anon, authenticated;

-- 7. CÁC HÀM QUẢN TRỊ ĐƠN HÀNG, GIAO DỊCH CẦN XEM & CẤU HÌNH GÓI (/admin/orders)
create or replace function public.get_admin_orders_and_events(
  p_status text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orders jsonb := '[]'::jsonb;
  v_total_orders integer := 0;
  v_events jsonb := '[]'::jsonb;
  v_needs_review_count integer := 0;
  v_plans jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  -- Tự động cập nhật trạng thái expired cho các đơn pending quá 48 giờ
  update public.orders
  set status = 'expired'
  where status = 'pending'
    and expires_at <= now();

  p_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  p_offset := greatest(0, coalesce(p_offset, 0));

  select count(*) into v_total_orders
  from public.orders o
  left join auth.users u on u.id = o.user_id
  left join public.profiles p on p.id = o.user_id
  where (p_status is null or p_status = 'all' or o.status = p_status)
    and (
      p_search is null or trim(p_search) = ''
      or o.payment_code ilike '%' || trim(p_search) || '%'
      or u.email ilike '%' || trim(p_search) || '%'
      or p.display_name ilike '%' || trim(p_search) || '%'
    );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'user_id', o.user_id,
      'user_email', u.email,
      'user_display_name', p.display_name,
      'plan_code', o.plan_code,
      'period', o.period,
      'amount', o.amount,
      'currency', o.currency,
      'status', o.status,
      'provider', o.provider,
      'provider_ref', o.provider_ref,
      'payment_code', o.payment_code,
      'created_at', o.created_at,
      'paid_at', o.paid_at,
      'expires_at', o.expires_at
    ) order by o.created_at desc
  ), '[]'::jsonb) into v_orders
  from (
    select o.*
    from public.orders o
    left join auth.users u on u.id = o.user_id
    left join public.profiles p on p.id = o.user_id
    where (p_status is null or p_status = 'all' or o.status = p_status)
      and (
        p_search is null or trim(p_search) = ''
        or o.payment_code ilike '%' || trim(p_search) || '%'
        or u.email ilike '%' || trim(p_search) || '%'
        or p.display_name ilike '%' || trim(p_search) || '%'
      )
    order by o.created_at desc
    limit p_limit
    offset p_offset
  ) o
  left join auth.users u on u.id = o.user_id
  left join public.profiles p on p.id = o.user_id;

  select count(*) into v_needs_review_count
  from public.payment_events
  where status = 'needs_review';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', pe.id,
      'provider', pe.provider,
      'event_id', pe.event_id,
      'status', pe.status,
      'reason', pe.reason,
      'order_id', pe.order_id,
      'order_payment_code', o.payment_code,
      'payload', pe.payload,
      'created_at', pe.created_at
    ) order by (pe.status = 'needs_review') desc, pe.created_at desc
  ), '[]'::jsonb) into v_events
  from (
    select *
    from public.payment_events
    order by (status = 'needs_review') desc, created_at desc
    limit 100
  ) pe
  left join public.orders o on o.id = pe.order_id;

  select coalesce(jsonb_agg(to_jsonb(pl.*) order by pl.code), '[]'::jsonb)
  into v_plans
  from public.plans pl;

  return jsonb_build_object(
    'orders', v_orders,
    'total_orders', v_total_orders,
    'payment_events', v_events,
    'needs_review_count', v_needs_review_count,
    'plans', v_plans
  );
end;
$$;

grant execute on function public.get_admin_orders_and_events(text, text, integer, integer) to authenticated;

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
    raise exception 'Bắt buộc nhập lý do / ghi chú đối chiếu để lưu nhật ký quản trị';
  end if;

  if p_action = 'manual_confirm_order' then
    if p_order_id is null then
      raise exception 'Thiếu mã đơn hàng cần xác nhận';
    end if;

    v_activation := public.activate_subscription_from_order(
      p_order_id,
      'manual_admin',
      v_admin_id,
      v_clean_reason
    );

    if not coalesce((v_activation->>'ok')::boolean, false) then
      raise exception 'Không thể xác nhận đơn hàng: %', coalesce(v_activation->>'status', 'unknown');
    end if;

    return jsonb_build_object('ok', true, 'action', p_action, 'activation', v_activation);

  elsif p_action = 'attach_event_to_order' then
    if p_event_id is null or p_order_id is null then
      raise exception 'Cần chọn giao dịch và đơn hàng cần gắn';
    end if;

    select * into v_event from public.payment_events where id = p_event_id for update;
    if not found then
      raise exception 'Không tìm thấy sự kiện thanh toán';
    end if;

    v_activation := public.activate_subscription_from_order(
      p_order_id,
      'sepay_event_' || v_event.event_id,
      v_admin_id,
      'Gắn giao dịch #' || v_event.event_id || ': ' || v_clean_reason
    );

    if not coalesce((v_activation->>'ok')::boolean, false) then
      raise exception 'Không thể kích hoạt đơn hàng: %', coalesce(v_activation->>'status', 'unknown');
    end if;

    update public.payment_events
    set status = 'processed',
        order_id = p_order_id,
        reason = 'Admin đã gắn vào đơn (' || v_clean_reason || ')'
    where id = p_event_id;

    insert into public.admin_audit_log (
      admin_id, action, target_type, target_id, before_state, after_state, reason
    ) values (
      v_admin_id,
      'payment_event_attach_order',
      'payment_event',
      p_event_id::text,
      to_jsonb(v_event.*),
      jsonb_build_object('status', 'processed', 'order_id', p_order_id, 'activation', v_activation),
      v_clean_reason
    );

    return jsonb_build_object('ok', true, 'action', p_action, 'activation', v_activation);

  elsif p_action = 'ignore_payment_event' then
    if p_event_id is null then
      raise exception 'Thiếu ID sự kiện thanh toán';
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
      set status = 'canceled'
      where user_id = v_order.user_id
        and status = 'active';

      insert into public.notifications (user_id, type, title, body, metadata)
      values (
        v_order.user_id,
        'plan_changed',
        'Đơn hàng đã được hoàn tiền & thu hồi gói Premium',
        'Đơn hàng ' || v_order.payment_code || ' đã được đánh dấu hoàn tiền (' || v_clean_reason || '). Tài khoản của bạn chuyển về gói Miễn phí, toàn bộ dữ liệu vẫn được giữ nguyên.',
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

create or replace function public.admin_update_plan_config(
  p_plan_code text,
  p_prices jsonb,
  p_limits jsonb,
  p_period_days jsonb default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_before public.plans%rowtype;
  v_after public.plans%rowtype;
  v_clean_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  if v_clean_reason = '' then
    raise exception 'Bắt buộc nhập lý do thay đổi cấu hình gói';
  end if;

  select * into v_before
  from public.plans
  where code = p_plan_code
  for update;

  if not found then
    raise exception 'Không tìm thấy gói: %', p_plan_code;
  end if;

  update public.plans
  set prices = coalesce(p_prices, prices),
      limits = coalesce(p_limits, limits),
      period_days = coalesce(p_period_days, period_days)
  where code = p_plan_code
  returning * into v_after;

  insert into public.admin_audit_log (
    admin_id, action, target_type, target_id, before_state, after_state, reason
  ) values (
    v_admin_id,
    'plan_update_config',
    'plan',
    p_plan_code,
    to_jsonb(v_before.*),
    to_jsonb(v_after.*),
    v_clean_reason
  );

  return jsonb_build_object(
    'ok', true,
    'plan', to_jsonb(v_after.*)
  );
end;
$$;

grant execute on function public.admin_update_plan_config(text, jsonb, jsonb, jsonb, text) to authenticated;

-- 8. CẬP NHẬT get_admin_system_overview BỔ SUNG THỐNG KÊ DOANH THU, ĐƠN PENDING, PREMIUM
create or replace function public.get_admin_system_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vn_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_vn_month_start timestamptz := (date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh');
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
  v_monthly_revenue_vnd bigint := 0;
  v_pending_orders integer := 0;
  v_active_premium_users integer := 0;
  v_expiring_soon_users integer := 0;
  v_needs_review_events integer := 0;
  v_signups_30d jsonb := '[]'::jsonb;
  v_activity_30d jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  -- Tự động hết hạn đơn quá 48 giờ
  update public.orders
  set status = 'expired'
  where status = 'pending'
    and expires_at <= now();

  -- 1. Người dùng & vai trò
  select count(*) into v_total_users from public.profiles;
  select count(*) into v_new_today from public.profiles where (created_at at time zone 'Asia/Ho_Chi_Minh')::date = v_vn_today;
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

  -- 4. AI usage (theo ngày Việt Nam)
  select coalesce(calls, 0) into v_ai_today_calls from public.ai_global_usage where date = v_vn_today;
  select coalesce(sum(tokens), 0) into v_ai_total_tokens from public.ai_global_usage;

  -- 5. Dung lượng Storage ước tính
  select coalesce(count(*) * 256000, 0) into v_storage_bytes from public.source_files;

  -- 6. Số liệu thanh toán & gói Premium
  select coalesce(sum(amount), 0) into v_monthly_revenue_vnd
  from public.orders
  where status = 'paid'
    and paid_at >= v_vn_month_start;

  select count(*) into v_pending_orders
  from public.orders
  where status = 'pending'
    and expires_at > now();

  select count(distinct user_id) into v_active_premium_users
  from public.subscriptions
  where plan_code = 'premium'
    and status = 'active'
    and (period_end is null or period_end > now());

  select count(distinct user_id) into v_expiring_soon_users
  from public.subscriptions
  where plan_code = 'premium'
    and status = 'active'
    and period_end is not null
    and period_end > now()
    and period_end <= now() + interval '7 days';

  select count(*) into v_needs_review_events
  from public.payment_events
  where status = 'needs_review';

  -- 7. Chuỗi 30 ngày đăng ký mới
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'label', to_char(d.day, 'DD/MM'),
      'count', coalesce(t.cnt, 0)
    ) order by d.day
  ), '[]'::jsonb) into v_signups_30d
  from generate_series(v_vn_today - interval '29 days', v_vn_today, interval '1 day') as d(day)
  left join (
    select (created_at at time zone 'Asia/Ho_Chi_Minh')::date as day, count(*) as cnt
    from public.profiles
    where created_at >= (v_vn_today - interval '29 days')
    group by 1
  ) t on t.day = d.day::date;

  -- 8. Chuỗi 30 ngày lượt ôn FSRS
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'label', to_char(d.day, 'DD/MM'),
      'count', coalesce(r.cnt, 0)
    ) order by d.day
  ), '[]'::jsonb) into v_activity_30d
  from generate_series(v_vn_today - interval '29 days', v_vn_today, interval '1 day') as d(day)
  left join (
    select (reviewed_at at time zone 'Asia/Ho_Chi_Minh')::date as day, count(*) as cnt
    from public.review_logs
    where reviewed_at >= (v_vn_today - interval '29 days')
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
    'billing', jsonb_build_object(
      'monthly_revenue_vnd', v_monthly_revenue_vnd,
      'pending_orders', v_pending_orders,
      'active_premium_users', v_active_premium_users,
      'expiring_soon_users', v_expiring_soon_users,
      'needs_review_events', v_needs_review_events
    ),
    'charts', jsonb_build_object(
      'signups_30d', v_signups_30d,
      'reviews_30d', v_activity_30d
    )
  );
end;
$$;

grant execute on function public.get_admin_system_overview() to authenticated;

