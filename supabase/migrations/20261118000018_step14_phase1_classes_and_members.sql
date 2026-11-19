-- ============================================================================
-- MemoQuiz - Bước 14 (Giai đoạn 1): Lớp học, Thành viên, Vào lớp & RLS
-- ============================================================================
-- Nguyên tắc bảo mật:
-- 1. Chỉ tài khoản vai trò giáo viên (public.is_teacher()) tạo/sửa/xóa lớp.
-- 2. RLS tách biệt tuyệt đối: GV chỉ thấy lớp và thành viên của mình; HS chỉ thấy
--    lớp mình tham gia (active/pending) và dòng thành viên của chính mình.
-- 3. KHÔNG mở policy đọc rộng trên bảng questions/choices/answers cho học sinh.
-- 4. Chống dò mã lớp qua check_rate_limit theo tài khoản & IP, trả thông báo chung.
-- 5. Mở rộng plans.limits (max_classes, max_students_per_class) qua get_entitlements.
-- ============================================================================

-- 1. TẠO BẢNG public.classes VÀ public.class_members
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text,
  join_code text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  require_approval boolean not null default false,
  is_open boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_classes_teacher_archived_created
  on public.classes (teacher_id, archived_at, created_at desc);

create table if not exists public.class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('pending', 'active', 'rejected', 'removed', 'left')),
  joined_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (class_id, user_id)
);

create index if not exists idx_class_members_class_status
  on public.class_members (class_id, status);

create index if not exists idx_class_members_user_status
  on public.class_members (user_id, status);

-- 2. HÀM HỖ TRỢ RLS (TRÁNH ĐỆ QUY GIỮA classes VÀ class_members)
create or replace function public.is_class_teacher(
  p_class_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.teacher_id = coalesce(p_user_id, auth.uid())
  );
$$;

create or replace function public.is_class_member_visible(
  p_class_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_members cm
    where cm.class_id = p_class_id
      and cm.user_id = coalesce(p_user_id, auth.uid())
      and cm.status in ('active', 'pending')
  );
$$;

grant execute on function public.is_class_teacher(uuid, uuid) to authenticated;
grant execute on function public.is_class_member_visible(uuid, uuid) to authenticated;

-- 3. BẬT RLS VÀ THIẾT LẬP POLICY CHO classes & class_members
alter table public.classes enable row level security;
alter table public.class_members enable row level security;

drop policy if exists "Classes select for teacher or visible member" on public.classes;
create policy "Classes select for teacher or visible member"
  on public.classes
  for select
  to authenticated
  using (
    teacher_id = auth.uid()
    or (archived_at is null and public.is_class_member_visible(id, auth.uid()))
  );

drop policy if exists "Classes insert for teacher only" on public.classes;
create policy "Classes insert for teacher only"
  on public.classes
  for insert
  to authenticated
  with check (
    teacher_id = auth.uid()
    and public.is_teacher()
  );

drop policy if exists "Classes update for owner teacher only" on public.classes;
create policy "Classes update for owner teacher only"
  on public.classes
  for update
  to authenticated
  using (
    teacher_id = auth.uid()
    and public.is_teacher()
  )
  with check (
    teacher_id = auth.uid()
    and public.is_teacher()
  );

drop policy if exists "Classes delete for owner teacher only" on public.classes;
create policy "Classes delete for owner teacher only"
  on public.classes
  for delete
  to authenticated
  using (
    teacher_id = auth.uid()
    and public.is_teacher()
  );

drop policy if exists "Class members select for self or class teacher" on public.class_members;
create policy "Class members select for self or class teacher"
  on public.class_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_class_teacher(class_id, auth.uid())
  );

drop policy if exists "Class members insert for class teacher only" on public.class_members;
create policy "Class members insert for class teacher only"
  on public.class_members
  for insert
  to authenticated
  with check (
    public.is_class_teacher(class_id, auth.uid())
    and public.is_teacher()
  );

drop policy if exists "Class members update for class teacher only" on public.class_members;
create policy "Class members update for class teacher only"
  on public.class_members
  for update
  to authenticated
  using (
    public.is_class_teacher(class_id, auth.uid())
    and public.is_teacher()
  )
  with check (
    public.is_class_teacher(class_id, auth.uid())
    and public.is_teacher()
  );

drop policy if exists "Class members delete for class teacher only" on public.class_members;
create policy "Class members delete for class teacher only"
  on public.class_members
  for delete
  to authenticated
  using (
    public.is_class_teacher(class_id, auth.uid())
    and public.is_teacher()
  );

-- 4. BỔ SUNG max_classes & max_students_per_class VÀO BẢNG plans & get_entitlements
update public.plans
set limits = coalesce(limits, '{}'::jsonb) || jsonb_build_object(
  'max_classes', 1,
  'max_students_per_class', 40
)
where code = 'free';

update public.plans
set limits = coalesce(limits, '{}'::jsonb) || jsonb_build_object(
  'max_classes', 10,
  'max_students_per_class', 200
)
where code = 'premium';

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
  v_max_classes integer;
  v_max_students_per_class integer;
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
        'max_classes', coalesce((v_raw_limits->>'max_classes')::integer, 1),
        'max_students_per_class', coalesce((v_raw_limits->>'max_students_per_class')::integer, 40),
        'max_questions_per_set', null,
        'max_sets_per_day', null
      ),
      'prices', coalesce(v_plan_prices, '{}'::jsonb),
      'period_days', coalesce(v_plan_period_days, '{}'::jsonb),
      'custom_ai_daily_limit', null
    );
  end if;

  select custom_ai_daily_limit into v_custom_limit
  from public.profiles
  where id = v_uid;

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
    v_plan_code := 'free';

    select id, status, period_end, source
    into v_inactive_id, v_inactive_status, v_inactive_period_end, v_inactive_source
    from public.subscriptions
    where user_id = v_uid
    order by created_at desc
    limit 1;
  end if;

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
  v_max_classes := coalesce((v_raw_limits->>'max_classes')::integer, 1);
  v_max_students_per_class := coalesce((v_raw_limits->>'max_students_per_class')::integer, 40);

  v_result_limits := v_raw_limits || jsonb_build_object(
    'max_sets', v_max_sets,
    'ai_daily', v_ai_daily,
    'ai_daily_limit', v_ai_daily,
    'max_file_mb', v_max_file_mb,
    'max_pdf_pages', v_max_pdf_pages,
    'storage_mb', v_storage_mb,
    'max_print_versions', v_max_print_versions,
    'max_export_versions', v_max_print_versions,
    'can_export_docx', v_can_export_docx,
    'max_classes', v_max_classes,
    'max_students_per_class', v_max_students_per_class
  );

  return jsonb_build_object(
    'plan_code', v_plan_code,
    'plan_name', coalesce(v_plan_name, case when v_plan_code = 'premium' then 'Premium' else 'Miễn phí' end),
    'is_premium', (v_plan_code = 'premium'),
    'status', coalesce(
      v_sub_status,
      case
        when v_inactive_status in ('revoked', 'canceled', 'expired') then v_inactive_status
        else 'active'
      end
    ),
    'period_end', case when v_sub_id is not null then v_sub_period_end else v_inactive_period_end end,
    'source', coalesce(v_sub_source, v_inactive_source, 'default'),
    'limits', v_result_limits,
    'prices', coalesce(v_plan_prices, '{}'::jsonb),
    'period_days', coalesce(v_plan_period_days, '{}'::jsonb),
    'custom_ai_daily_limit', v_custom_limit
  );
end;
$$;

-- 5. CẬP NHẬT delete_my_account: XÓA TƯ CÁCH THÀNH VIÊN & LỚP NHẤT QUÁN
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  -- Xóa tường minh tư cách thành viên lớp của học sinh (nếu có)
  delete from public.class_members
  where user_id = v_user_id;

  -- Nếu là giáo viên: xóa các lớp do giáo viên sở hữu (cascade class_members của lớp đó),
  -- nhất quán với cách xóa question_sets & exams hiện có; bảng attempts có student_id on delete set null.
  delete from public.classes
  where teacher_id = v_user_id;

  delete from auth.users
  where id = v_user_id;

  return jsonb_build_object('error', null);
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- 6. HÀM SINH MÃ LỚP 6 KÝ TỰ DUY NHẤT (BỎ 0/O/1/I)
create or replace function public.generate_unique_class_join_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_hash text;
  v_i integer;
  v_idx integer;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 40 then
      raise exception 'Could not generate unique class join code';
    end if;

    v_hash := md5(gen_random_uuid()::text || clock_timestamp()::text || v_attempt::text);
    v_code := '';
    for v_i in 0..5 loop
      v_idx := (('x' || substr(v_hash, 1 + v_i * 2, 2))::bit(8)::integer % 32) + 1;
      v_code := v_code || substr(v_alphabet, v_idx, 1);
    end loop;

    exit when not exists (
      select 1 from public.classes c where c.join_code = v_code
    );
  end loop;

  return v_code;
end;
$$;

revoke all on function public.generate_unique_class_join_code() from public;

-- 7. RPC TẠO LỚP (CHỈ GIÁO VIÊN, KIỂM TRA max_classes TỪ get_entitlements)
create or replace function public.create_class(
  p_name text,
  p_description text default null,
  p_require_approval boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_entitlements jsonb;
  v_max_classes integer;
  v_is_premium boolean;
  v_active_count integer;
  v_join_code text;
  v_row public.classes%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  if not public.is_teacher() then
    return jsonb_build_object('error', 'TEACHER_ONLY');
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    return jsonb_build_object('error', 'INVALID_NAME');
  end if;

  if v_desc is not null and char_length(v_desc) > 500 then
    return jsonb_build_object('error', 'INVALID_DESCRIPTION');
  end if;

  -- Khóa nhẹ theo giáo viên để tránh vượt hạn mức khi gửi đồng thời
  perform pg_advisory_xact_lock(hashtext('create_class:' || v_uid::text));

  v_entitlements := public.get_entitlements(v_uid);
  v_max_classes := coalesce((v_entitlements->'limits'->>'max_classes')::integer, 1);
  v_is_premium := coalesce((v_entitlements->>'is_premium')::boolean, false);

  select count(*)::integer into v_active_count
  from public.classes
  where teacher_id = v_uid
    and archived_at is null;

  if v_active_count >= v_max_classes then
    return jsonb_build_object(
      'error', 'MAX_CLASSES_REACHED',
      'current_count', v_active_count,
      'max_classes', v_max_classes,
      'is_premium', v_is_premium
    );
  end if;

  v_join_code := public.generate_unique_class_join_code();

  insert into public.classes (
    teacher_id, name, description, join_code, require_approval, is_open
  ) values (
    v_uid, v_name, v_desc, v_join_code, coalesce(p_require_approval, false), true
  )
  returning * into v_row;

  return jsonb_build_object(
    'error', null,
    'class', to_jsonb(v_row)
  );
end;
$$;

revoke all on function public.create_class(text, text, boolean) from public;
grant execute on function public.create_class(text, text, boolean) to authenticated;

-- 8. RPC ĐỔI MÃ LỚP MỚI
create or replace function public.regenerate_class_join_code(
  p_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new_code text;
  v_updated public.classes%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  if not public.is_teacher() then
    return jsonb_build_object('error', 'TEACHER_ONLY');
  end if;

  v_new_code := public.generate_unique_class_join_code();

  update public.classes
  set join_code = v_new_code
  where id = p_class_id
    and teacher_id = v_uid
  returning * into v_updated;

  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
  end if;

  return jsonb_build_object(
    'error', null,
    'join_code', v_updated.join_code,
    'class', to_jsonb(v_updated)
  );
end;
$$;

revoke all on function public.regenerate_class_join_code(uuid) from public;
grant execute on function public.regenerate_class_join_code(uuid) to authenticated;

-- 9. RPC CẬP NHẬT CÀI ĐẶT LỚP (ĐỔI TÊN, MÔ TẢ, ĐÓNG/MỞ, BẬT/TẮT DUYỆT, LƯU TRỮ/KHÔI PHỤC)
create or replace function public.update_class_settings(
  p_class_id uuid,
  p_name text default null,
  p_description text default null,
  p_update_description boolean default false,
  p_require_approval boolean default null,
  p_is_open boolean default null,
  p_archived boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.classes%rowtype;
  v_next_name text;
  v_next_desc text;
  v_entitlements jsonb;
  v_max_classes integer;
  v_is_premium boolean;
  v_active_count integer;
  v_updated public.classes%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  if not public.is_teacher() then
    return jsonb_build_object('error', 'TEACHER_ONLY');
  end if;

  select * into v_existing
  from public.classes
  where id = p_class_id
    and teacher_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
  end if;

  v_next_name := case when p_name is not null then btrim(p_name) else v_existing.name end;
  if char_length(v_next_name) < 1 or char_length(v_next_name) > 120 then
    return jsonb_build_object('error', 'INVALID_NAME');
  end if;

  v_next_desc := case
    when p_update_description then nullif(btrim(coalesce(p_description, '')), '')
    else v_existing.description
  end;
  if v_next_desc is not null and char_length(v_next_desc) > 500 then
    return jsonb_build_object('error', 'INVALID_DESCRIPTION');
  end if;

  -- Nếu khôi phục lớp đã lưu trữ -> kiểm tra giới hạn max_classes
  if p_archived = false and v_existing.archived_at is not null then
    v_entitlements := public.get_entitlements(v_uid);
    v_max_classes := coalesce((v_entitlements->'limits'->>'max_classes')::integer, 1);
    v_is_premium := coalesce((v_entitlements->>'is_premium')::boolean, false);

    select count(*)::integer into v_active_count
    from public.classes
    where teacher_id = v_uid
      and archived_at is null;

    if v_active_count >= v_max_classes then
      return jsonb_build_object(
        'error', 'MAX_CLASSES_REACHED',
        'current_count', v_active_count,
        'max_classes', v_max_classes,
        'is_premium', v_is_premium
      );
    end if;
  end if;

  update public.classes
  set
    name = v_next_name,
    description = v_next_desc,
    require_approval = coalesce(p_require_approval, require_approval),
    is_open = coalesce(p_is_open, is_open),
    archived_at = case
      when p_archived = true then coalesce(archived_at, now())
      when p_archived = false then null
      else archived_at
    end
  where id = p_class_id
    and teacher_id = v_uid
  returning * into v_updated;

  return jsonb_build_object(
    'error', null,
    'class', to_jsonb(v_updated)
  );
end;
$$;

revoke all on function public.update_class_settings(uuid, text, text, boolean, boolean, boolean, boolean) from public;
grant execute on function public.update_class_settings(uuid, text, text, boolean, boolean, boolean, boolean) to authenticated;

-- 10. RPC LẤY DANH SÁCH LỚP CỦA GIÁO VIÊN (KÈM SỐ HỌC SINH, CHỜ DUYỆT, BÀI ĐANG MỞ)
create or replace function public.get_teacher_classes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED', 'classes', '[]'::jsonb);
  end if;

  if not public.is_teacher() then
    return jsonb_build_object('error', 'TEACHER_ONLY', 'classes', '[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'teacher_id', c.teacher_id,
        'name', c.name,
        'description', c.description,
        'join_code', c.join_code,
        'require_approval', c.require_approval,
        'is_open', c.is_open,
        'archived_at', c.archived_at,
        'created_at', c.created_at,
        'active_student_count', (
          select count(*)::integer
          from public.class_members cm
          where cm.class_id = c.id and cm.status = 'active'
        ),
        'pending_count', (
          select count(*)::integer
          from public.class_members cm
          where cm.class_id = c.id and cm.status = 'pending'
        ),
        'open_assignment_count', 0
      )
      order by (c.archived_at is not null) asc, c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.classes c
  where c.teacher_id = v_uid;

  return jsonb_build_object(
    'error', null,
    'classes', v_rows
  );
end;
$$;

revoke all on function public.get_teacher_classes() from public;
grant execute on function public.get_teacher_classes() to authenticated;

-- 11. RPC LẤY DANH SÁCH THÀNH VIÊN CHO GIÁO VIÊN CHỦ LỚP (KÈM TÊN HIỂN THỊ & EMAIL)
create or replace function public.get_class_members_for_teacher(
  p_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_members jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED', 'members', '[]'::jsonb);
  end if;

  if not public.is_teacher() then
    return jsonb_build_object('error', 'TEACHER_ONLY', 'members', '[]'::jsonb);
  end if;

  if not exists (
    select 1 from public.classes c where c.id = p_class_id and c.teacher_id = v_uid
  ) then
    return jsonb_build_object('error', 'NOT_FOUND', 'members', '[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', cm.id,
        'class_id', cm.class_id,
        'user_id', cm.user_id,
        'display_name', coalesce(p.display_name, split_part(coalesce(u.email, ''), '@', 1), 'Học sinh'),
        'email', u.email,
        'status', cm.status,
        'joined_at', cm.joined_at,
        'decided_at', cm.decided_at
      )
      order by
        case cm.status
          when 'pending' then 0
          when 'active' then 1
          when 'left' then 2
          when 'rejected' then 3
          else 4
        end asc,
        cm.joined_at desc
    ),
    '[]'::jsonb
  )
  into v_members
  from public.class_members cm
  left join public.profiles p on p.id = cm.user_id
  left join auth.users u on u.id = cm.user_id
  where cm.class_id = p_class_id;

  return jsonb_build_object(
    'error', null,
    'members', v_members
  );
end;
$$;

revoke all on function public.get_class_members_for_teacher(uuid) from public;
grant execute on function public.get_class_members_for_teacher(uuid) to authenticated;

-- 12. RPC DUYỆT / TỪ CHỐI / XÓA HỌC SINH KHỎI LỚP + GỬI THÔNG BÁO
create or replace function public.decide_class_member(
  p_class_id uuid,
  p_member_user_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_class public.classes%rowtype;
  v_member public.class_members%rowtype;
  v_entitlements jsonb;
  v_max_students integer;
  v_active_students integer;
  v_next_status text;
  v_notif_title text;
  v_notif_body text;
  v_notif_type text;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  if not public.is_teacher() then
    return jsonb_build_object('error', 'TEACHER_ONLY');
  end if;

  if p_action not in ('approve', 'reject', 'remove') then
    return jsonb_build_object('error', 'INVALID_ACTION');
  end if;

  select * into v_class
  from public.classes
  where id = p_class_id
    and teacher_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
  end if;

  select * into v_member
  from public.class_members
  where class_id = p_class_id
    and user_id = p_member_user_id
  for update;

  if not found then
    return jsonb_build_object('error', 'MEMBER_NOT_FOUND');
  end if;

  if p_action = 'approve' then
    if v_member.status <> 'pending' then
      return jsonb_build_object('error', 'INVALID_STATUS_TRANSITION');
    end if;

    v_entitlements := public.get_entitlements(v_uid);
    v_max_students := coalesce((v_entitlements->'limits'->>'max_students_per_class')::integer, 40);

    select count(*)::integer into v_active_students
    from public.class_members
    where class_id = p_class_id
      and status = 'active';

    if v_active_students >= v_max_students then
      return jsonb_build_object(
        'error', 'CLASS_FULL',
        'current_count', v_active_students,
        'max_students', v_max_students,
        'is_premium', coalesce((v_entitlements->>'is_premium')::boolean, false)
      );
    end if;

    v_next_status := 'active';
    v_notif_type := 'system';
    v_notif_title := 'Yêu cầu vào lớp đã được duyệt';
    v_notif_body := 'Bạn đã chính thức trở thành thành viên lớp "' || v_class.name || '".';
  elsif p_action = 'reject' then
    if v_member.status <> 'pending' then
      return jsonb_build_object('error', 'INVALID_STATUS_TRANSITION');
    end if;
    v_next_status := 'rejected';
    v_notif_type := 'system';
    v_notif_title := 'Yêu cầu vào lớp bị từ chối';
    v_notif_body := 'Giáo viên đã từ chối yêu cầu tham gia lớp "' || v_class.name || '".';
  else
    -- remove
    if v_member.status not in ('active', 'pending') then
      return jsonb_build_object('error', 'INVALID_STATUS_TRANSITION');
    end if;
    v_next_status := 'removed';
    v_notif_type := 'system';
    v_notif_title := 'Bạn đã bị xóa khỏi lớp học';
    v_notif_body := 'Giáo viên đã xóa bạn khỏi lớp "' || v_class.name || '".';
  end if;

  update public.class_members
  set status = v_next_status,
      decided_at = now()
  where id = v_member.id;

  begin
    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      p_member_user_id,
      v_notif_type,
      v_notif_title,
      v_notif_body,
      jsonb_build_object('class_id', v_class.id, 'class_name', v_class.name, 'action', p_action)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'error', null,
    'status', v_next_status
  );
end;
$$;

revoke all on function public.decide_class_member(uuid, uuid, text) from public;
grant execute on function public.decide_class_member(uuid, uuid, text) to authenticated;

-- 13. RPC TRA CỨU THÔNG TIN TỐI THIỂU CỦA LỚP THEO MÃ (CHỐNG DÒ MÃ BẰNG RATE LIMIT)
create or replace function public.lookup_class_by_join_code(
  p_join_code text,
  p_client_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_join_code, '')));
  v_ip text := coalesce(nullif(btrim(coalesce(p_client_ip, '')), ''), 'unknown');
  v_allowed boolean;
  v_class public.classes%rowtype;
  v_teacher_name text;
  v_my_status text := null;
  v_entitlements jsonb;
  v_max_students integer;
  v_active_students integer;
begin
  -- Chống dò mã theo IP và theo tài khoản
  v_allowed := public.check_rate_limit('class_lookup_ip:' || v_ip, 25, 300);
  if not v_allowed then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;

  if v_uid is not null then
    v_allowed := public.check_rate_limit('class_lookup_user:' || v_uid::text, 20, 300);
    if not v_allowed then
      return jsonb_build_object('error', 'RATE_LIMITED');
    end if;
  end if;

  if v_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;

  select * into v_class
  from public.classes
  where join_code = v_code
    and archived_at is null
  limit 1;

  if not found then
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;

  select coalesce(p.display_name, 'Giáo viên')
  into v_teacher_name
  from public.profiles p
  where p.id = v_class.teacher_id;

  if v_uid is not null then
    select cm.status into v_my_status
    from public.class_members cm
    where cm.class_id = v_class.id
      and cm.user_id = v_uid
    limit 1;
  end if;

  v_entitlements := public.get_entitlements(v_class.teacher_id);
  v_max_students := coalesce((v_entitlements->'limits'->>'max_students_per_class')::integer, 40);

  select count(*)::integer into v_active_students
  from public.class_members
  where class_id = v_class.id
    and status = 'active';

  return jsonb_build_object(
    'error', null,
    'class', jsonb_build_object(
      'id', v_class.id,
      'name', v_class.name,
      'description', v_class.description,
      'teacher_name', coalesce(v_teacher_name, 'Giáo viên'),
      'require_approval', v_class.require_approval,
      'is_open', v_class.is_open,
      'is_full', (v_active_students >= v_max_students),
      'is_own_class', (v_uid is not null and v_class.teacher_id = v_uid),
      'my_status', v_my_status
    )
  );
end;
$$;

revoke all on function public.lookup_class_by_join_code(text, text) from public;
grant execute on function public.lookup_class_by_join_code(text, text) to anon, authenticated;

-- 14. RPC VÀO LỚP BẰNG MÃ (IDEMPOTENT, KIỂM TRA DUYỆT/ĐÓNG/HẾT CHỖ/TỐI ĐA 10 LỚP/RATE LIMIT)
create or replace function public.join_class_by_code(
  p_join_code text,
  p_client_ip text default null,
  p_max_student_classes integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_join_code, '')));
  v_ip text := coalesce(nullif(btrim(coalesce(p_client_ip, '')), ''), 'unknown');
  v_limit_student_classes integer := greatest(1, least(coalesce(p_max_student_classes, 10), 10));
  v_allowed boolean;
  v_class public.classes%rowtype;
  v_existing public.class_members%rowtype;
  v_student_name text;
  v_student_class_count integer;
  v_entitlements jsonb;
  v_max_students integer;
  v_active_students integer;
  v_next_status text;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  -- Chống dò mã theo tài khoản và IP
  v_allowed := public.check_rate_limit('class_join_user:' || v_uid::text, 15, 300);
  if not v_allowed then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;

  v_allowed := public.check_rate_limit('class_join_ip:' || v_ip, 25, 300);
  if not v_allowed then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;

  if v_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;

  select * into v_class
  from public.classes
  where join_code = v_code
    and archived_at is null
  for update;

  if not found then
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;

  if v_class.teacher_id = v_uid then
    return jsonb_build_object('error', 'CANNOT_JOIN_OWN_CLASS');
  end if;

  -- Kiểm tra trạng thái hiện tại (idempotent nếu đã active hoặc pending)
  select * into v_existing
  from public.class_members
  where class_id = v_class.id
    and user_id = v_uid
  for update;

  if found then
    if v_existing.status = 'active' then
      return jsonb_build_object(
        'error', null,
        'status', 'active',
        'already_member', true,
        'class_id', v_class.id,
        'class_name', v_class.name
      );
    elsif v_existing.status = 'pending' then
      return jsonb_build_object(
        'error', null,
        'status', 'pending',
        'already_member', true,
        'class_id', v_class.id,
        'class_name', v_class.name
      );
    elsif v_existing.status = 'rejected' then
      return jsonb_build_object('error', 'MEMBER_REJECTED');
    elsif v_existing.status = 'removed' then
      return jsonb_build_object('error', 'MEMBER_REMOVED');
    end if;
    -- Trường hợp status = 'left': cho phép xin vào lại theo đúng quy tắc của lớp
  end if;

  if not v_class.is_open then
    return jsonb_build_object('error', 'CLASS_CLOSED');
  end if;

  -- Kiểm tra giới hạn số lớp học sinh tham gia (tối đa 10 lớp)
  select count(*)::integer into v_student_class_count
  from public.class_members cm
  join public.classes c on c.id = cm.class_id
  where cm.user_id = v_uid
    and cm.status in ('active', 'pending')
    and c.archived_at is null;

  if v_student_class_count >= v_limit_student_classes then
    return jsonb_build_object(
      'error', 'STUDENT_MAX_CLASSES_REACHED',
      'max_classes', v_limit_student_classes
    );
  end if;

  -- Kiểm tra sĩ số tối đa của lớp theo gói của giáo viên (get_entitlements)
  v_entitlements := public.get_entitlements(v_class.teacher_id);
  v_max_students := coalesce((v_entitlements->'limits'->>'max_students_per_class')::integer, 40);

  select count(*)::integer into v_active_students
  from public.class_members
  where class_id = v_class.id
    and status = 'active';

  if v_active_students >= v_max_students then
    return jsonb_build_object(
      'error', 'CLASS_FULL',
      'max_students', v_max_students
    );
  end if;

  v_next_status := case when v_class.require_approval then 'pending' else 'active' end;

  insert into public.class_members (
    class_id, user_id, status, joined_at, decided_at
  ) values (
    v_class.id,
    v_uid,
    v_next_status,
    now(),
    case when v_next_status = 'active' then now() else null end
  )
  on conflict (class_id, user_id) do update
    set status = excluded.status,
        joined_at = now(),
        decided_at = excluded.decided_at;

  -- Nếu lớp bật duyệt -> gửi thông báo cho giáo viên
  if v_next_status = 'pending' then
    select coalesce(p.display_name, 'Một học sinh')
    into v_student_name
    from public.profiles p
    where p.id = v_uid;

    begin
      insert into public.notifications (user_id, type, title, body, metadata)
      values (
        v_class.teacher_id,
        'system',
        'Có yêu cầu xin vào lớp mới',
        coalesce(v_student_name, 'Một học sinh') || ' vừa xin vào lớp "' || v_class.name || '". Hãy duyệt trong mục Lớp học.',
        jsonb_build_object('class_id', v_class.id, 'class_name', v_class.name, 'student_id', v_uid)
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'error', null,
    'status', v_next_status,
    'already_member', false,
    'class_id', v_class.id,
    'class_name', v_class.name
  );
end;
$$;

revoke all on function public.join_class_by_code(text, text, integer) from public;
grant execute on function public.join_class_by_code(text, text, integer) to authenticated;

-- 15. RPC RỜI LỚP DÀNH CHO HỌC SINH
create or replace function public.leave_class(
  p_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  update public.class_members
  set status = 'left',
      decided_at = now()
  where class_id = p_class_id
    and user_id = v_uid
    and status in ('active', 'pending');

  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
  end if;

  return jsonb_build_object('error', null, 'left', true);
end;
$$;

revoke all on function public.leave_class(uuid) from public;
grant execute on function public.leave_class(uuid) to authenticated;

-- 16. RPC LẤY DANH SÁCH LỚP CỦA HỌC SINH (CHỈ TÊN LỚP, TÊN GIÁO VIÊN, TRẠNG THÁI CHÍNH MÌNH)
create or replace function public.get_student_classes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED', 'classes', '[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'class_id', c.id,
        'name', c.name,
        'description', c.description,
        'teacher_name', coalesce(p.display_name, 'Giáo viên'),
        'status', cm.status,
        'joined_at', cm.joined_at,
        'decided_at', cm.decided_at
      )
      order by (cm.status = 'active') desc, cm.joined_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.class_members cm
  join public.classes c on c.id = cm.class_id
  left join public.profiles p on p.id = c.teacher_id
  where cm.user_id = v_uid
    and cm.status in ('active', 'pending')
    and c.archived_at is null;

  return jsonb_build_object(
    'error', null,
    'classes', v_rows
  );
end;
$$;

revoke all on function public.get_student_classes() from public;
grant execute on function public.get_student_classes() to authenticated;

