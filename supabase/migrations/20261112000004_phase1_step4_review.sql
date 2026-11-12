-- ============================================================================
-- MemoQuiz - Giai đoạn 1 (Bước 4): Màn hình duyệt nhanh, Sửa nguyên tử & Hoàn tác
-- ============================================================================

-- 1. Mở rộng bảng public.questions
alter table public.questions
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists reviewed_by_human boolean not null default false,
  add column if not exists reviewed_at timestamptz,
  add column if not exists raw_source_text text;

create index if not exists idx_questions_set_id_confidence
  on public.questions(set_id, confidence);

-- 2. Trigger tự động cập nhật updated_at bằng clock_timestamp() khi sửa dòng questions
create or replace function public.handle_questions_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists on_questions_updated_at on public.questions;
create trigger on_questions_updated_at
  before update on public.questions
  for each row execute function public.handle_questions_updated_at();

-- 3. Hàm RPC nguyên tử lưu chỉnh sửa tại dòng (Inline Edit) kèm kiểm tra xung đột updated_at
-- Sử dụng SECURITY INVOKER (mặc định) để mọi câu lệnh bên trong đều chịu sự kiểm soát của RLS
create or replace function public.save_question_inline(
  p_question_id uuid,
  p_expected_updated_at timestamptz,
  p_type text,
  p_stem text,
  p_explanation text default null,
  p_topic text default null,
  p_difficulty text default null,
  p_status text default 'draft',
  p_choices jsonb default '[]'::jsonb,
  p_answer_text text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_updated_at timestamptz;
  v_new_updated_at timestamptz;
  v_new_reviewed_at timestamptz;
begin
  select updated_at
    into v_current_updated_at
    from public.questions
    where id = p_question_id
    for update;

  if not found then
    raise exception 'NOT_FOUND_OR_FORBIDDEN';
  end if;

  if p_expected_updated_at is not null
     and date_trunc('milliseconds', v_current_updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then
    return jsonb_build_object(
      'conflict', true,
      'server_updated_at', v_current_updated_at
    );
  end if;

  update public.questions
  set
    type = p_type,
    stem = p_stem,
    explanation = p_explanation,
    topic = p_topic,
    difficulty = p_difficulty,
    status = p_status,
    confidence = 1.0,
    reviewed_by_human = true,
    reviewed_at = clock_timestamp()
  where id = p_question_id
  returning updated_at, reviewed_at
    into v_new_updated_at, v_new_reviewed_at;

  delete from public.choices where question_id = p_question_id;
  delete from public.answers where question_id = p_question_id;

  if p_type in ('mcq', 'true_false') and jsonb_typeof(p_choices) = 'array' then
    insert into public.choices (question_id, text, is_correct, position, ai_generated)
    select
      p_question_id,
      coalesce(elem->>'text', ''),
      coalesce((elem->>'is_correct')::boolean, false),
      coalesce((elem->>'position')::integer, (ord - 1)::integer),
      coalesce((elem->>'ai_generated')::boolean, false)
    from jsonb_array_elements(p_choices) with ordinality as t(elem, ord);
  elsif p_type in ('cloze', 'short_answer') and p_answer_text is not null and btrim(p_answer_text) <> '' then
    insert into public.answers (question_id, answer_text, accepted_variants)
    values (p_question_id, btrim(p_answer_text), '{}');
  end if;

  return jsonb_build_object(
    'conflict', false,
    'updated_at', v_new_updated_at,
    'reviewed_at', v_new_reviewed_at,
    'reviewed_by_human', true,
    'confidence', 1.0
  );
end;
$$;

grant execute on function public.save_question_inline(
  uuid, timestamptz, text, text, text, text, text, text, jsonb, text
) to authenticated;

-- 4. Hàm RPC nguyên tử khôi phục danh sách bản chụp câu hỏi (dùng cho Hoàn tác / Làm lại)
-- Sử dụng SECURITY INVOKER để RLS bảo vệ quyền sở hữu trên từng câu hỏi
create or replace function public.restore_questions_snapshot(
  p_snapshots jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_q_id uuid;
  v_type text;
  v_answer_text text;
  v_updated_at timestamptz;
  v_results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_snapshots) <> 'array' then
    raise exception 'INVALID_SNAPSHOT_PAYLOAD';
  end if;

  for v_item in select * from jsonb_array_elements(p_snapshots)
  loop
    v_q_id := (v_item->>'id')::uuid;
    v_type := v_item->>'type';
    v_answer_text := v_item->>'answer_text';

    update public.questions
    set
      type = v_type,
      stem = coalesce(v_item->>'stem', stem),
      explanation = v_item->>'explanation',
      topic = v_item->>'topic',
      difficulty = v_item->>'difficulty',
      confidence = case
        when v_item ? 'confidence' and v_item->>'confidence' is not null
        then (v_item->>'confidence')::numeric
        else null
      end,
      status = coalesce(v_item->>'status', status),
      warnings = coalesce(v_item->'warnings', '[]'::jsonb),
      ai_generated = coalesce((v_item->>'ai_generated')::boolean, false),
      reviewed_by_human = coalesce((v_item->>'reviewed_by_human')::boolean, false),
      reviewed_at = case
        when v_item ? 'reviewed_at' and v_item->>'reviewed_at' is not null
        then (v_item->>'reviewed_at')::timestamptz
        else null
      end
    where id = v_q_id
    returning updated_at into v_updated_at;

    if not found then
      raise exception 'NOT_FOUND_OR_FORBIDDEN';
    end if;

    delete from public.choices where question_id = v_q_id;
    delete from public.answers where question_id = v_q_id;

    if v_type in ('mcq', 'true_false') and jsonb_typeof(v_item->'choices') = 'array' then
      insert into public.choices (question_id, text, is_correct, position, ai_generated)
      select
        v_q_id,
        coalesce(c_elem->>'text', ''),
        coalesce((c_elem->>'is_correct')::boolean, false),
        coalesce((c_elem->>'position')::integer, (ord - 1)::integer),
        coalesce((c_elem->>'ai_generated')::boolean, false)
      from jsonb_array_elements(v_item->'choices') with ordinality as t(c_elem, ord);
    elsif v_type in ('cloze', 'short_answer') and v_answer_text is not null and btrim(v_answer_text) <> '' then
      insert into public.answers (question_id, answer_text, accepted_variants)
      values (v_q_id, btrim(v_answer_text), '{}');
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('id', v_q_id, 'updated_at', v_updated_at)
    );
  end loop;

  return v_results;
end;
$$;

grant execute on function public.restore_questions_snapshot(jsonb) to authenticated;

