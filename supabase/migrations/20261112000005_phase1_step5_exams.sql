-- ============================================================================
-- MemoQuiz - Giai đoạn 1 (Bước 5): Tạo bài kiểm tra, Học sinh làm bài (/t/[code]) & Chấm tự động
-- ============================================================================

-- 1. Mở rộng bảng public.exams
alter table public.exams
  add column if not exists code text unique,
  add column if not exists is_open boolean not null default true,
  add column if not exists show_answers boolean not null default true,
  add column if not exists opens_at timestamptz,
  add column if not exists closes_at timestamptz,
  add column if not exists max_attempts integer not null default 1 check (max_attempts >= 1),
  add column if not exists total_points numeric(6,2) not null default 10.0;

create unique index if not exists idx_exams_code_upper
  on public.exams (upper(code))
  where code is not null;

-- 2. Mở rộng bảng public.exam_questions (lưu bản chụp câu hỏi tại thời điểm tạo đề)
-- Cho phép question_id nhận null và đổi FK sang ON DELETE SET NULL để xóa câu gốc không làm hỏng đề đã tạo
alter table public.exam_questions
  alter column question_id drop not null;

alter table public.exam_questions
  drop constraint if exists exam_questions_question_id_fkey;

alter table public.exam_questions
  add constraint exam_questions_question_id_fkey
  foreign key (question_id) references public.questions(id) on delete set null;

alter table public.exam_questions
  add column if not exists question_snapshot jsonb not null default '{}'::jsonb;

-- 3. Mở rộng bảng public.attempts cho học sinh không cần tài khoản (bảo vệ bằng attempt_token)
alter table public.attempts
  add column if not exists student_name text not null default '',
  add column if not exists student_class text,
  add column if not exists attempt_token text unique,
  add column if not exists deadline_at timestamptz,
  add column if not exists status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'expired')),
  add column if not exists needs_manual_review boolean not null default false,
  add column if not exists question_order uuid[] not null default '{}',
  add column if not exists choice_orders jsonb not null default '{}'::jsonb,
  add column if not exists flagged_questions uuid[] not null default '{}';

create unique index if not exists idx_attempts_attempt_token
  on public.attempts(attempt_token)
  where attempt_token is not null;

create index if not exists idx_attempts_exam_student_lookup
  on public.attempts(exam_id, lower(btrim(student_name)));

-- 4. Mở rộng bảng public.attempt_answers
alter table public.attempt_answers
  alter column question_id drop not null;

alter table public.attempt_answers
  drop constraint if exists attempt_answers_question_id_fkey;

alter table public.attempt_answers
  add constraint attempt_answers_question_id_fkey
  foreign key (question_id) references public.questions(id) on delete set null;

alter table public.attempt_answers
  add column if not exists exam_question_id uuid references public.exam_questions(id) on delete cascade,
  add column if not exists points_awarded numeric(5,2),
  add column if not exists needs_review boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_attempt_answers_attempt_exam_q
  on public.attempt_answers(attempt_id, exam_question_id)
  where exam_question_id is not null;

-- 5. Bảng giới hạn tần suất (rate_limits) bảo vệ các route công khai (/t/[code])
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hit_count integer not null default 1
);

alter table public.rate_limits enable row level security;
-- Không mở policy trực tiếp cho anon/authenticated trên rate_limits; chỉ truy cập qua RPC SECURITY DEFINER

create or replace function public.check_rate_limit(
  p_key text,
  p_max_hits integer default 20,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_hit_count integer;
begin
  if p_key is null or btrim(p_key) = '' then
    return true;
  end if;

  insert into public.rate_limits (key, window_start, hit_count)
  values (p_key, v_now, 1)
  on conflict (key) do update
  set
    hit_count = case
      when public.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now
      then 1
      else public.rate_limits.hit_count + 1
    end,
    window_start = case
      when public.rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now
      then v_now
      else public.rate_limits.window_start
    end
  returning window_start, hit_count into v_window_start, v_hit_count;

  return v_hit_count <= p_max_hits;
end;
$$;

grant execute on function public.check_rate_limit(text, integer, integer) to anon, authenticated;

-- ============================================================================
-- 6. CÁC HÀM RPC BẢO MẬT CHO HỌC SINH LÀM BÀI (SECURITY DEFINER)
-- Đảm bảo:
--   - Không mở RLS SELECT đại trà trên exams, exam_questions, attempts, attempt_answers
--   - Tuyệt đối không trả đáp án đúng (is_correct, answer_text, accepted_variants, explanation)
--     về trình duyệt trước khi lượt làm chuyển sang trạng thái đã nộp (submitted / expired)
-- ============================================================================

-- 6.1. Lấy thông tin công khai của bài kiểm tra theo mã tham gia (không chứa nội dung câu hỏi/đáp án)
create or replace function public.get_public_exam_by_code(
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams%rowtype;
  v_question_structure jsonb;
begin
  if p_code is null or btrim(p_code) = '' then
    return null;
  end if;

  select *
    into v_exam
    from public.exams
    where upper(code) = upper(btrim(p_code))
    limit 1;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'exam_question_id', eq.id,
        'position', eq.position,
        'choice_ids', coalesce(
          (
            select jsonb_agg(c_elem->>'id' order by coalesce((c_elem->>'position')::integer, ord::integer - 1))
            from jsonb_array_elements(
              case
                when jsonb_typeof(eq.question_snapshot->'choices') = 'array'
                then eq.question_snapshot->'choices'
                else '[]'::jsonb
              end
            ) with ordinality as t(c_elem, ord)
          ),
          '[]'::jsonb
        )
      )
      order by eq.position asc
    ),
    '[]'::jsonb
  )
  into v_question_structure
  from public.exam_questions eq
  where eq.exam_id = v_exam.id;

  return jsonb_build_object(
    'id', v_exam.id,
    'code', v_exam.code,
    'title', v_exam.title,
    'duration_min', v_exam.duration_min,
    'shuffle_questions', v_exam.shuffle_questions,
    'shuffle_choices', v_exam.shuffle_choices,
    'is_open', v_exam.is_open,
    'show_answers', v_exam.show_answers,
    'opens_at', v_exam.opens_at,
    'closes_at', v_exam.closes_at,
    'max_attempts', v_exam.max_attempts,
    'total_points', v_exam.total_points,
    'question_count', jsonb_array_length(v_question_structure),
    'question_structure', v_question_structure,
    'server_now', clock_timestamp()
  );
end;
$$;

grant execute on function public.get_public_exam_by_code(text) to anon, authenticated;

-- 6.2. Bắt đầu một lượt làm bài mới (kiểm tra mở/đóng, khung giờ, số lượt tối đa)
create or replace function public.start_public_exam_attempt(
  p_code text,
  p_student_name text,
  p_student_class text,
  p_attempt_token text,
  p_question_order uuid[],
  p_choice_orders jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam public.exams%rowtype;
  v_now timestamptz := clock_timestamp();
  v_clean_name text := btrim(coalesce(p_student_name, ''));
  v_clean_class text := nullif(btrim(coalesce(p_student_class, '')), '');
  v_existing_count integer := 0;
  v_deadline timestamptz := null;
  v_attempt_id uuid;
begin
  if v_clean_name = '' or char_length(v_clean_name) > 100 then
    return jsonb_build_object('error', 'INVALID_STUDENT_NAME');
  end if;

  if v_clean_class is not null and char_length(v_clean_class) > 50 then
    return jsonb_build_object('error', 'INVALID_STUDENT_CLASS');
  end if;

  if p_attempt_token is null or char_length(p_attempt_token) < 32 then
    return jsonb_build_object('error', 'INVALID_TOKEN');
  end if;

  select *
    into v_exam
    from public.exams
    where upper(code) = upper(btrim(coalesce(p_code, '')))
    limit 1;

  if not found then
    return jsonb_build_object('error', 'EXAM_NOT_FOUND');
  end if;

  if not v_exam.is_open then
    return jsonb_build_object('error', 'EXAM_CLOSED');
  end if;

  if v_exam.opens_at is not null and v_now < v_exam.opens_at then
    return jsonb_build_object('error', 'EXAM_NOT_YET_OPEN');
  end if;

  if v_exam.closes_at is not null and v_now > v_exam.closes_at then
    return jsonb_build_object('error', 'EXAM_EXPIRED_WINDOW');
  end if;

  select count(*)
    into v_existing_count
    from public.attempts a
    where a.exam_id = v_exam.id
      and lower(btrim(a.student_name)) = lower(v_clean_name)
      and coalesce(lower(btrim(a.student_class)), '') = coalesce(lower(v_clean_class), '');

  if v_existing_count >= v_exam.max_attempts then
    return jsonb_build_object('error', 'MAX_ATTEMPTS_REACHED');
  end if;

  if v_exam.duration_min is not null and v_exam.duration_min > 0 then
    v_deadline := v_now + make_interval(mins => v_exam.duration_min);
    if v_exam.closes_at is not null and v_exam.closes_at < v_deadline then
      v_deadline := v_exam.closes_at;
    end if;
  elsif v_exam.closes_at is not null then
    v_deadline := v_exam.closes_at;
  end if;

  insert into public.attempts (
    exam_id,
    set_id,
    student_name,
    student_class,
    attempt_token,
    started_at,
    deadline_at,
    status,
    question_order,
    choice_orders,
    flagged_questions
  )
  values (
    v_exam.id,
    v_exam.set_id,
    v_clean_name,
    v_clean_class,
    p_attempt_token,
    v_now,
    v_deadline,
    'in_progress',
    coalesce(p_question_order, '{}'),
    coalesce(p_choice_orders, '{}'::jsonb),
    '{}'
  )
  returning id into v_attempt_id;

  return jsonb_build_object(
    'error', null,
    'attempt_id', v_attempt_id,
    'attempt_token', p_attempt_token,
    'started_at', v_now,
    'deadline_at', v_deadline,
    'server_now', v_now
  );
end;
$$;

grant execute on function public.start_public_exam_attempt(text, text, text, text, uuid[], jsonb) to anon, authenticated;

-- 6.3. Tải dữ liệu lượt làm bài theo attempt_token (ẩn hoàn toàn đáp án khi đang làm hoặc khi tắt show_answers)
create or replace function public.get_student_attempt_by_token(
  p_attempt_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.attempts%rowtype;
  v_exam public.exams%rowtype;
  v_reveal_answers boolean := false;
  v_questions jsonb := '[]'::jsonb;
  v_answers jsonb := '[]'::jsonb;
begin
  if p_attempt_token is null or btrim(p_attempt_token) = '' then
    return null;
  end if;

  select *
    into v_attempt
    from public.attempts
    where attempt_token = btrim(p_attempt_token)
    limit 1;

  if not found or v_attempt.exam_id is null then
    return null;
  end if;

  select *
    into v_exam
    from public.exams
    where id = v_attempt.exam_id
    limit 1;

  if not found then
    return null;
  end if;

  -- Chỉ cho phép trả đáp án đúng & giải thích khi ĐÃ NỘP (submitted / expired) VÀ giáo viên bật show_answers
  v_reveal_answers := (v_attempt.status in ('submitted', 'expired')) and v_exam.show_answers;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'exam_question_id', eq.id,
        'question_id', eq.question_id,
        'points', eq.points,
        'position', eq.position,
        'type', coalesce(eq.question_snapshot->>'type', 'mcq'),
        'stem', coalesce(eq.question_snapshot->>'stem', ''),
        'choices', coalesce(
          (
            select jsonb_agg(
              case
                when v_reveal_answers then
                  jsonb_build_object(
                    'id', c_elem->>'id',
                    'text', coalesce(c_elem->>'text', ''),
                    'position', coalesce((c_elem->>'position')::integer, (ord - 1)::integer),
                    'is_correct', coalesce((c_elem->>'is_correct')::boolean, false)
                  )
                else
                  jsonb_build_object(
                    'id', c_elem->>'id',
                    'text', coalesce(c_elem->>'text', ''),
                    'position', coalesce((c_elem->>'position')::integer, (ord - 1)::integer)
                  )
              end
              order by coalesce((c_elem->>'position')::integer, (ord - 1)::integer)
            )
            from jsonb_array_elements(
              case
                when jsonb_typeof(eq.question_snapshot->'choices') = 'array'
                then eq.question_snapshot->'choices'
                else '[]'::jsonb
              end
            ) with ordinality as t(c_elem, ord)
          ),
          '[]'::jsonb
        ),
        'answer_text', case when v_reveal_answers then eq.question_snapshot->>'answer_text' else null end,
        'explanation', case when v_reveal_answers then eq.question_snapshot->>'explanation' else null end
      )
      order by eq.position asc
    ),
    '[]'::jsonb
  )
  into v_questions
  from public.exam_questions eq
  where eq.exam_id = v_exam.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'exam_question_id', aa.exam_question_id,
        'question_id', aa.question_id,
        'response', aa.response,
        'is_correct', case when v_attempt.status in ('submitted', 'expired') then aa.is_correct else null end,
        'points_awarded', case when v_attempt.status in ('submitted', 'expired') then aa.points_awarded else null end,
        'needs_review', case when v_attempt.status in ('submitted', 'expired') then aa.needs_review else false end
      )
    ),
    '[]'::jsonb
  )
  into v_answers
  from public.attempt_answers aa
  where aa.attempt_id = v_attempt.id;

  return jsonb_build_object(
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'code', v_exam.code,
      'title', v_exam.title,
      'duration_min', v_exam.duration_min,
      'is_open', v_exam.is_open,
      'show_answers', v_exam.show_answers,
      'opens_at', v_exam.opens_at,
      'closes_at', v_exam.closes_at,
      'total_points', v_exam.total_points
    ),
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'student_name', v_attempt.student_name,
      'student_class', v_attempt.student_class,
      'started_at', v_attempt.started_at,
      'submitted_at', v_attempt.submitted_at,
      'deadline_at', v_attempt.deadline_at,
      'status', v_attempt.status,
      'score', v_attempt.score,
      'needs_manual_review', v_attempt.needs_manual_review,
      'question_order', v_attempt.question_order,
      'choice_orders', v_attempt.choice_orders,
      'flagged_questions', v_attempt.flagged_questions
    ),
    'questions', v_questions,
    'answers', v_answers,
    'server_now', clock_timestamp()
  );
end;
$$;

grant execute on function public.get_student_attempt_by_token(text) to anon, authenticated;

-- 6.4. Tự lưu bài làm dở theo attempt_token
create or replace function public.save_student_attempt_draft(
  p_attempt_token text,
  p_responses jsonb default '[]'::jsonb,
  p_flagged_questions uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.attempts%rowtype;
  v_exam public.exams%rowtype;
  v_now timestamptz := clock_timestamp();
  v_item jsonb;
  v_eq_id uuid;
  v_q_id uuid;
  v_resp text;
begin
  if p_attempt_token is null or btrim(p_attempt_token) = '' then
    return jsonb_build_object('error', 'INVALID_TOKEN');
  end if;

  select *
    into v_attempt
    from public.attempts
    where attempt_token = btrim(p_attempt_token)
    for update;

  if not found or v_attempt.exam_id is null then
    return jsonb_build_object('error', 'ATTEMPT_NOT_FOUND');
  end if;

  if v_attempt.status <> 'in_progress' then
    return jsonb_build_object('error', 'ATTEMPT_ALREADY_SUBMITTED');
  end if;

  select *
    into v_exam
    from public.exams
    where id = v_attempt.exam_id;

  if not v_exam.is_open then
    return jsonb_build_object('error', 'EXAM_CLOSED');
  end if;

  -- Cho phép ân hạn 10 giây trễ mạng khi tự động lưu/nộp lúc hết giờ
  if v_attempt.deadline_at is not null and v_now > v_attempt.deadline_at + interval '10 seconds' then
    return jsonb_build_object('error', 'ATTEMPT_TIME_EXPIRED');
  end if;

  if p_flagged_questions is not null then
    update public.attempts
    set flagged_questions = p_flagged_questions
    where id = v_attempt.id;
  end if;

  if jsonb_typeof(p_responses) = 'array' then
    for v_item in select * from jsonb_array_elements(p_responses)
    loop
      v_eq_id := (v_item->>'exam_question_id')::uuid;
      v_resp := left(coalesce(v_item->>'response', ''), 2000);

      select eq.question_id
        into v_q_id
        from public.exam_questions eq
        where eq.id = v_eq_id
          and eq.exam_id = v_attempt.exam_id;

      if found then
        insert into public.attempt_answers (
          attempt_id,
          exam_question_id,
          question_id,
          response,
          updated_at
        )
        values (
          v_attempt.id,
          v_eq_id,
          v_q_id,
          v_resp,
          v_now
        )
        on conflict (attempt_id, exam_question_id) where exam_question_id is not null
        do update set
          response = excluded.response,
          updated_at = v_now;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'error', null,
    'saved_at', v_now
  );
end;
$$;

grant execute on function public.save_student_attempt_draft(text, jsonb, uuid[]) to anon, authenticated;

-- 6.5. Khóa lượt làm bài (chuyển sang submitted/expired) và lấy snapshot để chấm trên server
-- Bảo mật: Hàm này CHỈ trả về question_snapshot SAU KHI đã khóa vĩnh viễn trạng thái lượt làm
-- thành submitted/expired trong cùng transaction (ngăn học sinh đọc đáp án khi đang làm bài).
create or replace function public.lock_attempt_for_server_grading(
  p_attempt_token text,
  p_final_responses jsonb default '[]'::jsonb,
  p_flagged_questions uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.attempts%rowtype;
  v_exam public.exams%rowtype;
  v_now timestamptz := clock_timestamp();
  v_final_status text := 'submitted';
  v_item jsonb;
  v_eq_id uuid;
  v_q_id uuid;
  v_resp text;
  v_questions_with_snapshots jsonb;
  v_saved_answers jsonb;
begin
  if p_attempt_token is null or btrim(p_attempt_token) = '' then
    return jsonb_build_object('error', 'INVALID_TOKEN');
  end if;

  select *
    into v_attempt
    from public.attempts
    where attempt_token = btrim(p_attempt_token)
    for update;

  if not found or v_attempt.exam_id is null then
    return jsonb_build_object('error', 'ATTEMPT_NOT_FOUND');
  end if;

  if v_attempt.status <> 'in_progress' then
    return jsonb_build_object('error', 'ATTEMPT_ALREADY_SUBMITTED');
  end if;

  select *
    into v_exam
    from public.exams
    where id = v_attempt.exam_id;

  if not v_exam.is_open then
    return jsonb_build_object('error', 'EXAM_CLOSED');
  end if;

  if v_attempt.deadline_at is not null and v_now > v_attempt.deadline_at + interval '15 seconds' then
    v_final_status := 'expired';
  end if;

  -- Chỉ lưu câu trả lời gửi kèm nếu còn trong thời hạn (kể cả 15s ân hạn tự nộp khi hết giờ)
  if jsonb_typeof(p_final_responses) = 'array'
     and (v_attempt.deadline_at is null or v_now <= v_attempt.deadline_at + interval '30 seconds') then
    for v_item in select * from jsonb_array_elements(p_final_responses)
    loop
      v_eq_id := (v_item->>'exam_question_id')::uuid;
      v_resp := left(coalesce(v_item->>'response', ''), 2000);

      select eq.question_id
        into v_q_id
        from public.exam_questions eq
        where eq.id = v_eq_id
          and eq.exam_id = v_attempt.exam_id;

      if found then
        insert into public.attempt_answers (
          attempt_id,
          exam_question_id,
          question_id,
          response,
          updated_at
        )
        values (
          v_attempt.id,
          v_eq_id,
          v_q_id,
          v_resp,
          v_now
        )
        on conflict (attempt_id, exam_question_id) where exam_question_id is not null
        do update set
          response = excluded.response,
          updated_at = v_now;
      end if;
    end loop;
  end if;

  -- KHÓA VĨNH VIỄN LƯỢT LÀM TRƯỚC KHI TRẢ SNAPSHOT CHO SERVER CHẤM
  update public.attempts
  set
    status = v_final_status,
    submitted_at = v_now,
    flagged_questions = coalesce(p_flagged_questions, flagged_questions)
  where id = v_attempt.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'exam_question_id', eq.id,
        'question_id', eq.question_id,
        'points', eq.points,
        'position', eq.position,
        'snapshot', eq.question_snapshot
      )
      order by eq.position asc
    ),
    '[]'::jsonb
  )
  into v_questions_with_snapshots
  from public.exam_questions eq
  where eq.exam_id = v_attempt.exam_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'exam_question_id', aa.exam_question_id,
        'question_id', aa.question_id,
        'response', aa.response
      )
    ),
    '[]'::jsonb
  )
  into v_saved_answers
  from public.attempt_answers aa
  where aa.attempt_id = v_attempt.id;

  return jsonb_build_object(
    'error', null,
    'attempt_id', v_attempt.id,
    'status', v_final_status,
    'submitted_at', v_now,
    'total_points', v_exam.total_points,
    'questions', v_questions_with_snapshots,
    'answers', v_saved_answers
  );
end;
$$;

grant execute on function public.lock_attempt_for_server_grading(text, jsonb, uuid[]) to anon, authenticated;

-- 6.6. Lưu kết quả chấm điểm từ server (/lib/grading) cho lượt làm vừa khóa
create or replace function public.save_server_grading_result(
  p_attempt_token text,
  p_score numeric,
  p_needs_manual_review boolean,
  p_graded_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.attempts%rowtype;
  v_item jsonb;
  v_eq_id uuid;
  v_q_id uuid;
begin
  if p_attempt_token is null or btrim(p_attempt_token) = '' then
    return jsonb_build_object('error', 'INVALID_TOKEN');
  end if;

  select *
    into v_attempt
    from public.attempts
    where attempt_token = btrim(p_attempt_token)
    for update;

  if not found then
    return jsonb_build_object('error', 'ATTEMPT_NOT_FOUND');
  end if;

  -- Chỉ cho phép ghi điểm tự động lần đầu ngay sau khi khóa bài (khi score còn null)
  if v_attempt.score is not null then
    return jsonb_build_object('error', 'ALREADY_GRADED');
  end if;

  update public.attempts
  set
    score = p_score,
    needs_manual_review = coalesce(p_needs_manual_review, false)
  where id = v_attempt.id;

  if jsonb_typeof(p_graded_answers) = 'array' then
    for v_item in select * from jsonb_array_elements(p_graded_answers)
    loop
      v_eq_id := (v_item->>'exam_question_id')::uuid;

      select eq.question_id
        into v_q_id
        from public.exam_questions eq
        where eq.id = v_eq_id
          and eq.exam_id = v_attempt.exam_id;

      if found then
        insert into public.attempt_answers (
          attempt_id,
          exam_question_id,
          question_id,
          response,
          is_correct,
          points_awarded,
          needs_review,
          updated_at
        )
        values (
          v_attempt.id,
          v_eq_id,
          v_q_id,
          v_item->>'response',
          case
            when v_item ? 'is_correct' and v_item->>'is_correct' is not null
            then (v_item->>'is_correct')::boolean
            else null
          end,
          coalesce((v_item->>'points_awarded')::numeric, 0),
          coalesce((v_item->>'needs_review')::boolean, false),
          clock_timestamp()
        )
        on conflict (attempt_id, exam_question_id) where exam_question_id is not null
        do update set
          is_correct = excluded.is_correct,
          points_awarded = excluded.points_awarded,
          needs_review = excluded.needs_review,
          updated_at = clock_timestamp();
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'error', null,
    'score', p_score,
    'needs_manual_review', coalesce(p_needs_manual_review, false)
  );
end;
$$;

grant execute on function public.save_server_grading_result(text, numeric, boolean, jsonb) to anon, authenticated;

