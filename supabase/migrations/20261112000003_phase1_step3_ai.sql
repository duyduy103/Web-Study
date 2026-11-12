-- ============================================================================
-- MemoQuiz - Giai đoạn 1 (Bước 3): Hạ tầng AI, Cache, Hạn mức nguyên tử & PDF/Ảnh
-- ============================================================================

-- 1. Thêm cột ai_generated vào questions và choices; đảm bảo source_ref tồn tại
alter table public.questions
  add column if not exists ai_generated boolean not null default false;

alter table public.questions
  add column if not exists source_ref text;

alter table public.choices
  add column if not exists ai_generated boolean not null default false;

-- 2. Tạo bảng ai_cache lưu kết quả gọi AI theo từng chủ sở hữu (owner_id)
create table if not exists public.ai_cache (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  cache_key text not null,
  task text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (owner_id, cache_key)
);

create index if not exists idx_ai_cache_owner_key
  on public.ai_cache(owner_id, cache_key);

alter table public.ai_cache enable row level security;

drop policy if exists "ai_cache_owner_select" on public.ai_cache;
create policy "ai_cache_owner_select"
  on public.ai_cache for select
  using (owner_id = auth.uid());

drop policy if exists "ai_cache_owner_insert" on public.ai_cache;
create policy "ai_cache_owner_insert"
  on public.ai_cache for insert
  with check (owner_id = auth.uid());

drop policy if exists "ai_cache_owner_update" on public.ai_cache;
create policy "ai_cache_owner_update"
  on public.ai_cache for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "ai_cache_owner_delete" on public.ai_cache;
create policy "ai_cache_owner_delete"
  on public.ai_cache for delete
  using (owner_id = auth.uid());

-- 3. Hàm RPC nguyên tử kiểm tra và tăng bộ đếm ai_usage theo (auth.uid(), current_date)
-- Sử dụng SECURITY DEFINER với phạm vi hẹp nhất: chỉ thao tác trên dòng của chính auth.uid()
-- nên không cần dùng service_role key ở tầng ứng dụng web.
create or replace function public.consume_ai_quota(
  p_daily_limit integer default 30,
  p_tokens integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
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
      where user_id = v_user_id and date = current_date;

    return jsonb_build_object(
      'allowed', false,
      'calls', coalesce(v_calls, 0),
      'tokens', coalesce(v_tokens, 0),
      'remaining', 0
    );
  end if;

  insert into public.ai_usage (user_id, date, calls, tokens)
  values (v_user_id, current_date, 1, greatest(0, p_tokens))
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
    where user_id = v_user_id and date = current_date;

  return jsonb_build_object(
    'allowed', false,
    'calls', coalesce(v_calls, p_daily_limit),
    'tokens', coalesce(v_tokens, 0),
    'remaining', 0
  );
end;
$$;

revoke all on function public.consume_ai_quota(integer, integer) from public;
grant execute on function public.consume_ai_quota(integer, integer) to authenticated;

-- 4. Hàm RPC cộng thêm số token thực tế sau khi nhận phản hồi từ Gemini
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
begin
  v_user_id := auth.uid();
  if v_user_id is null or p_tokens <= 0 then
    return;
  end if;

  update public.ai_usage
    set tokens = public.ai_usage.tokens + p_tokens
    where user_id = v_user_id and date = current_date;
end;
$$;

revoke all on function public.record_ai_tokens(integer) from public;
grant execute on function public.record_ai_tokens(integer) to authenticated;

-- 5. Mở rộng bucket 'source-files' cho phép nạp thêm PDF và ảnh (.png, .jpg/.jpeg)
update storage.buckets
set allowed_mime_types = array[
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/pdf',
  'image/png',
  'image/jpeg'
]
where id = 'source-files';

