-- ============================================================================
-- MemoQuiz - Bước 14 (Giai đoạn 2): Giao bài cho lớp học (Exam & Study FSRS)
-- ============================================================================
-- Bảo mật:
-- 1. Không mở RLS đọc rộng trên questions/choices/answers/exams cho học sinh.
-- 2. Mọi truy cập nội dung bài giao đều qua RPC SECURITY DEFINER kiểm tra
--    status = 'active' trong class_members, quyền sở hữu của giáo viên,
--    hạn nộp / khóa sau hạn, số lần làm tối đa và ẩn đáp án trước khi nộp/lật thẻ.
-- 3. exams.access_mode = 'class_only' chặn truy cập qua mã công khai /t/[code].
-- ============================================================================

-- 1. MỞ RỘNG BẢNG exams & TẠO BẢNG class_assignments + LIÊN KẾT attempts
alter table public.exams
  add column if not exists access_mode text not null default 'public_code'
    check (access_mode in ('public_code', 'class_only'));

create table if not exists public.class_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  kind text not null check (kind in ('exam', 'study')),
  exam_id uuid references public.exams(id) on delete cascade,
  set_id uuid references public.question_sets(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 150),
  instructions text,
  due_at timestamptz,
  lock_after_due boolean not null default false,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (
    (kind = 'exam' and exam_id is not null and set_id is null)
    or (kind = 'study' and set_id is not null and exam_id is null)
  )
);

create index if not exists idx_class_assignments_class_created
  on public.class_assignments (class_id, created_at desc);

create index if not exists idx_class_assignments_exam
  on public.class_assignments (exam_id)
  where exam_id is not null;

create index if not exists idx_class_assignments_set
  on public.class_assignments (set_id)
  where set_id is not null;

alter table public.attempts
  add column if not exists assignment_id uuid references public.class_assignments(id) on delete set null;

create index if not exists idx_attempts_assignment_student
  on public.attempts (assignment_id, student_id)
  where assignment_id is not null;

-- 2. HÀM KIỂM TRA THÀNH VIÊN ACTIVE CỦA LỚP (LỚP CHƯA LƯU TRỮ)
create or replace function public.is_active_class_member(
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
    join public.classes c on c.id = cm.class_id
    where cm.class_id = p_class_id
      and cm.user_id = coalesce(p_user_id, auth.uid())
      and cm.status = 'active'
      and c.archived_at is null
  );
$$;

grant execute on function public.is_active_class_member(uuid, uuid) to authenticated;

-- 3. BẬT RLS CHO public.class_assignments
alter table public.class_assignments enable row level security;

drop policy if exists "Class assignments select for teacher or active member" on public.class_assignments;
create policy "Class assignments select for teacher or active member"
  on public.class_assignments
  for select
  to authenticated
  using (
    public.is_class_teacher(class_id, auth.uid())
    or public.is_active_class_member(class_id, auth.uid())
  );

drop policy if exists "Class assignments insert for owner teacher only" on public.class_assignments;
create policy "Class assignments insert for owner teacher only"
  on public.class_assignments
  for insert
  to authenticated
  with check (
    public.is_class_teacher(class_id, auth.uid())
    and public.is_teacher()
  );

drop policy if exists "Class assignments update for owner teacher only" on public.class_assignments;
create policy "Class assignments update for owner teacher only"
  on public.class_assignments
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

drop policy if exists "Class assignments delete for owner teacher only" on public.class_assignments;
create policy "Class assignments delete for owner teacher only"
  on public.class_assignments
  for delete
  to authenticated
  using (
    public.is_class_teacher(class_id, auth.uid())
    and public.is_teacher()
  );

-- 4. CẬP NHẬT get_teacher_classes ĐỂ ĐẾM ĐÚNG open_assignment_count
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
        'open_assignment_count', (
          select count(*)::integer
          from public.class_assignments ca
          where ca.class_id = c.id and ca.closed_at is null
        )
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

-- 5. CẬP NHẬT get_public_exam_by_code & start_public_exam_attempt CHẶN access_mode = 'class_only'
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
      and access_mode = 'public_code'
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
      and access_mode = 'public_code'
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

  if v_exam.max_attempts is not null and v_exam.max_attempts > 0 then
    select count(*)::integer
      into v_existing_count
      from public.attempts a
      where a.exam_id = v_exam.id
        and lower(btrim(coalesce(a.student_name, ''))) = lower(v_clean_name)
        and lower(btrim(coalesce(a.student_class, ''))) = lower(coalesce(v_clean_class, ''));

    if v_existing_count >= v_exam.max_attempts then
      return jsonb_build_object('error', 'MAX_ATTEMPTS_REACHED');
    end if;
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
    student_id,
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
    null,
    v_clean_name,
    v_clean_class,
    btrim(p_attempt_token),
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

-- 6. CẬP NHẬT RPC XEM/LƯU/NỘP LƯỢT LÀM BÀI ĐỂ RÀNG BUỘC THÀNH VIÊN ACTIVE KHI LÀ BÀI GIAO LỚP
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
  v_assignment public.class_assignments%rowtype;
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

  -- Nếu là bài làm thuộc bài giao lớp: BẮT BUỘC đúng chính chủ và còn là thành viên active của lớp
  if v_attempt.assignment_id is not null then
    if auth.uid() is null or v_attempt.student_id is distinct from auth.uid() then
      return null;
    end if;

    select * into v_assignment
    from public.class_assignments
    where id = v_attempt.assignment_id
    limit 1;

    if not found or not public.is_active_class_member(v_assignment.class_id, auth.uid()) then
      return null;
    end if;
  end if;

  select *
    into v_exam
    from public.exams
    where id = v_attempt.exam_id
    limit 1;

  if not found then
    return null;
  end if;

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
      'assignment_id', v_attempt.assignment_id,
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
  v_assignment public.class_assignments%rowtype;
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

  if v_attempt.assignment_id is not null then
    if auth.uid() is null or v_attempt.student_id is distinct from auth.uid() then
      return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
    end if;

    select * into v_assignment
    from public.class_assignments
    where id = v_attempt.assignment_id
    limit 1;

    if not found or not public.is_active_class_member(v_assignment.class_id, auth.uid()) then
      return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
    end if;

    if v_assignment.closed_at is not null then
      return jsonb_build_object('error', 'ASSIGNMENT_CLOSED');
    end if;

    if v_assignment.lock_after_due and v_assignment.due_at is not null and v_now > v_assignment.due_at + interval '10 seconds' then
      return jsonb_build_object('error', 'ATTEMPT_TIME_EXPIRED');
    end if;
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
          attempt_id, exam_question_id, question_id, response, updated_at
        )
        values (
          v_attempt.id, v_eq_id, v_q_id, v_resp, v_now
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
  v_assignment public.class_assignments%rowtype;
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

  if v_attempt.assignment_id is not null then
    if auth.uid() is null or v_attempt.student_id is distinct from auth.uid() then
      return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
    end if;

    select * into v_assignment
    from public.class_assignments
    where id = v_attempt.assignment_id
    limit 1;

    if not found or not public.is_active_class_member(v_assignment.class_id, auth.uid()) then
      return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
    end if;
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
          attempt_id, exam_question_id, question_id, response, updated_at
        )
        values (
          v_attempt.id, v_eq_id, v_q_id, v_resp, v_now
        )
        on conflict (attempt_id, exam_question_id) where exam_question_id is not null
        do update set
          response = excluded.response,
          updated_at = v_now;
      end if;
    end loop;
  end if;

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
    'questions', v_questions_with_snapshots,
    'answers', v_saved_answers
  );
end;
$$;

-- 7. MỞ RỘNG 3 RPC ÔN TẬP FSRS HỖ TRỢ p_code = 'class_assignment:<assignment_id>'
create or replace function public.get_learner_study_overview(
  p_secret_hash text,
  p_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_learner public.learners%rowtype;
  v_set public.question_sets%rowtype;
  v_assignment public.class_assignments%rowtype;
  v_enrollment public.learner_set_enrollments%rowtype;
  v_questions jsonb := '[]'::jsonb;
  v_card_states jsonb := '[]'::jsonb;
  v_review_logs jsonb := '[]'::jsonb;
  v_enrolled_sets jsonb := '[]'::jsonb;
  v_is_own_set boolean := false;
  v_is_class_assignment boolean := false;
  v_target_set_id uuid := null;
  v_target_assignment_id uuid := null;
  v_trimmed_code text := btrim(coalesce(p_code, ''));
begin
  if p_secret_hash is null or btrim(p_secret_hash) = '' then
    return jsonb_build_object('error', 'UNAUTHORIZED_LEARNER');
  end if;

  select *
    into v_learner
    from public.learners
    where secret_hash = btrim(p_secret_hash)
    limit 1;

  if not found then
    return jsonb_build_object('error', 'UNAUTHORIZED_LEARNER');
  end if;

  if v_trimmed_code <> '' then
    -- Nhánh 1: Ôn tập theo bài giao trong lớp ('class_assignment:<uuid>')
    if v_trimmed_code like 'class_assignment:%' then
      begin
        v_target_assignment_id := substring(v_trimmed_code from 18)::uuid;
      exception when others then
        return jsonb_build_object('error', 'STUDY_SET_NOT_FOUND');
      end;

      if v_learner.user_id is null then
        return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
      end if;

      select * into v_assignment
      from public.class_assignments
      where id = v_target_assignment_id
        and kind = 'study'
      limit 1;

      if not found then
        return jsonb_build_object('error', 'STUDY_SET_NOT_FOUND');
      end if;

      if not public.is_active_class_member(v_assignment.class_id, v_learner.user_id) then
        return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
      end if;

      if v_assignment.closed_at is not null then
        return jsonb_build_object('error', 'ASSIGNMENT_CLOSED');
      end if;

      if v_assignment.lock_after_due and v_assignment.due_at is not null and clock_timestamp() > v_assignment.due_at then
        return jsonb_build_object('error', 'ASSIGNMENT_LOCKED_AFTER_DUE');
      end if;

      select * into v_set
      from public.question_sets
      where id = v_assignment.set_id
      limit 1;

      if not found then
        return jsonb_build_object('error', 'STUDY_SET_NOT_FOUND');
      end if;

      v_is_class_assignment := true;
    else
      -- Nhánh 2: Bộ cá nhân (UUID) hoặc mã học công khai (study_code)
      begin
        v_target_set_id := v_trimmed_code::uuid;
      exception when others then
        v_target_set_id := null;
      end;

      if v_target_set_id is not null and v_learner.user_id is not null then
        select *
          into v_set
          from public.question_sets
          where id = v_target_set_id
            and owner_id = v_learner.user_id
          limit 1;
      end if;

      if v_set.id is null then
        select *
          into v_set
          from public.question_sets
          where upper(study_code) = upper(v_trimmed_code)
          limit 1;
      end if;

      if v_set.id is null then
        return jsonb_build_object('error', 'STUDY_SET_NOT_FOUND');
      end if;

      v_is_own_set := (v_learner.user_id is not null and v_set.owner_id = v_learner.user_id);

      if not v_set.study_enabled and not v_is_own_set then
        return jsonb_build_object('error', 'STUDY_SET_DISABLED');
      end if;
    end if;

    insert into public.learner_set_enrollments (learner_id, set_id, last_studied_at)
    values (v_learner.id, v_set.id, clock_timestamp())
    on conflict (learner_id, set_id) do update
      set last_studied_at = clock_timestamp()
    returning * into v_enrollment;

    -- CHỈ trả câu hỏi approved, KHÔNG trả đáp án trước khi lật thẻ
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'type', q.type,
          'stem', q.stem,
          'topic', q.topic,
          'difficulty', q.difficulty
        )
        order by q.created_at asc
      ),
      '[]'::jsonb
    )
    into v_questions
    from public.questions q
    where q.set_id = v_set.id
      and q.status = 'approved';

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'question_id', cs.question_id,
          'due', cs.due,
          'stability', cs.stability,
          'difficulty', cs.difficulty,
          'elapsed_days', cs.elapsed_days,
          'scheduled_days', cs.scheduled_days,
          'learning_steps', cs.learning_steps,
          'reps', cs.reps,
          'lapses', cs.lapses,
          'state', cs.state,
          'last_review', cs.last_review
        )
      ),
      '[]'::jsonb
    )
    into v_card_states
    from public.card_states cs
    join public.questions q on q.id = cs.question_id
    where cs.learner_id = v_learner.id
      and q.set_id = v_set.id
      and q.status = 'approved';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rl.id,
        'question_id', rl.question_id,
        'set_id', q.set_id,
        'rating', rl.rating,
        'state_before', rl.state_before,
        'elapsed_days', rl.elapsed_days,
        'scheduled_days', rl.scheduled_days,
        'reviewed_at', rl.reviewed_at
      )
      order by rl.reviewed_at desc
    ),
    '[]'::jsonb
  )
  into v_review_logs
  from public.review_logs rl
  join public.questions q on q.id = rl.question_id
  where rl.learner_id = v_learner.id
    and rl.reviewed_at >= clock_timestamp() - interval '35 days';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'set_id', qs.id,
        'title', qs.title,
        'subject', qs.subject,
        'grade', qs.grade,
        'study_code', qs.study_code,
        'study_enabled', qs.study_enabled,
        'daily_new_limit', lse.daily_new_limit,
        'leech_threshold', lse.leech_threshold,
        'last_studied_at', lse.last_studied_at,
        'approved_count', (
          select count(*) from public.questions q2
          where q2.set_id = qs.id and q2.status = 'approved'
        ),
        'due_count', (
          select count(*) from public.card_states cs2
          join public.questions q3 on q3.id = cs2.question_id
          where cs2.learner_id = v_learner.id
            and q3.set_id = qs.id
            and q3.status = 'approved'
            and cs2.due <= clock_timestamp()
        )
      )
      order by lse.last_studied_at desc
    ),
    '[]'::jsonb
  )
  into v_enrolled_sets
  from public.learner_set_enrollments lse
  join public.question_sets qs on qs.id = lse.set_id
  where lse.learner_id = v_learner.id
    and (
      (qs.study_enabled = true and qs.study_code is not null)
      or (v_learner.user_id is not null and qs.owner_id = v_learner.user_id)
    );

  return jsonb_build_object(
    'error', null,
    'learner', jsonb_build_object(
      'id', v_learner.id,
      'nickname', v_learner.nickname,
      'created_at', v_learner.created_at
    ),
    'set', case
      when v_set.id is not null then jsonb_build_object(
        'id', v_set.id,
        'title', case when v_is_class_assignment then v_assignment.title else v_set.title end,
        'subject', v_set.subject,
        'grade', v_set.grade,
        'study_code', case when v_is_class_assignment then v_trimmed_code else coalesce(v_set.study_code, v_set.id::text) end,
        'study_enabled', (v_set.study_enabled or v_is_own_set or v_is_class_assignment),
        'daily_new_limit', coalesce(v_enrollment.daily_new_limit, 20),
        'leech_threshold', coalesce(v_enrollment.leech_threshold, 3)
      )
      else null
    end,
    'questions', v_questions,
    'card_states', v_card_states,
    'review_logs', v_review_logs,
    'enrolled_sets', v_enrolled_sets,
    'server_now', clock_timestamp()
  );
end;
$$;

create or replace function public.reveal_study_card_hint_or_answer(
  p_secret_hash text,
  p_code text,
  p_question_id uuid,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_learner public.learners%rowtype;
  v_set public.question_sets%rowtype;
  v_assignment public.class_assignments%rowtype;
  v_question public.questions%rowtype;
  v_choices jsonb := '[]'::jsonb;
  v_answer public.answers%rowtype;
  v_target_set_id uuid := null;
  v_target_assignment_id uuid := null;
  v_trimmed_code text := btrim(coalesce(p_code, ''));
begin
  select *
    into v_learner
    from public.learners
    where secret_hash = btrim(coalesce(p_secret_hash, ''))
    limit 1;

  if not found then
    return jsonb_build_object('error', 'UNAUTHORIZED_LEARNER');
  end if;

  if v_trimmed_code like 'class_assignment:%' then
    begin
      v_target_assignment_id := substring(v_trimmed_code from 18)::uuid;
    exception when others then
      return jsonb_build_object('error', 'STUDY_SET_DISABLED');
    end;

    if v_learner.user_id is null then
      return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
    end if;

    select * into v_assignment
    from public.class_assignments
    where id = v_target_assignment_id
      and kind = 'study'
    limit 1;

    if not found or not public.is_active_class_member(v_assignment.class_id, v_learner.user_id) then
      return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
    end if;

    if v_assignment.closed_at is not null
       or (v_assignment.lock_after_due and v_assignment.due_at is not null and clock_timestamp() > v_assignment.due_at) then
      return jsonb_build_object('error', 'ASSIGNMENT_CLOSED');
    end if;

    select * into v_set
    from public.question_sets
    where id = v_assignment.set_id
    limit 1;
  else
    begin
      v_target_set_id := v_trimmed_code::uuid;
    exception when others then
      v_target_set_id := null;
    end;

    if v_target_set_id is not null and v_learner.user_id is not null then
      select *
        into v_set
        from public.question_sets
        where id = v_target_set_id
          and owner_id = v_learner.user_id
        limit 1;
    end if;

    if v_set.id is null then
      select *
        into v_set
        from public.question_sets
        where upper(study_code) = upper(v_trimmed_code)
          and (
            study_enabled = true
            or (v_learner.user_id is not null and owner_id = v_learner.user_id)
          )
        limit 1;
    end if;
  end if;

  if v_set.id is null then
    return jsonb_build_object('error', 'STUDY_SET_DISABLED');
  end if;

  select *
    into v_question
    from public.questions
    where id = p_question_id
      and set_id = v_set.id
      and status = 'approved'
    limit 1;

  if not found then
    return jsonb_build_object('error', 'QUESTION_NOT_FOUND');
  end if;

  if p_mode = 'choices_hint' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'text', c.text,
          'position', c.position
        )
        order by c.position asc
      ),
      '[]'::jsonb
    )
    into v_choices
    from public.choices c
    where c.question_id = v_question.id;

    return jsonb_build_object(
      'error', null,
      'question_id', v_question.id,
      'choices', v_choices
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'text', c.text,
        'position', c.position,
        'is_correct', c.is_correct
      )
      order by c.position asc
    ),
    '[]'::jsonb
  )
  into v_choices
  from public.choices c
  where c.question_id = v_question.id;

  select *
    into v_answer
    from public.answers a
    where a.question_id = v_question.id
    limit 1;

  return jsonb_build_object(
    'error', null,
    'question_id', v_question.id,
    'choices', v_choices,
    'answer_text', v_answer.answer_text,
    'accepted_variants', coalesce(v_answer.accepted_variants, '{}'),
    'explanation', v_question.explanation,
    'source_ref', v_question.source_ref
  );
end;
$$;

create or replace function public.record_learner_card_review(
  p_secret_hash text,
  p_code text,
  p_question_id uuid,
  p_rating smallint,
  p_state_before smallint,
  p_elapsed_days integer,
  p_scheduled_days integer,
  p_due timestamptz,
  p_stability double precision,
  p_difficulty double precision,
  p_learning_steps integer,
  p_reps integer,
  p_lapses integer,
  p_next_state smallint,
  p_reviewed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_learner public.learners%rowtype;
  v_set public.question_sets%rowtype;
  v_assignment public.class_assignments%rowtype;
  v_question public.questions%rowtype;
  v_prev_state public.card_states%rowtype;
  v_has_prev boolean := false;
  v_log_id uuid;
  v_target_set_id uuid := null;
  v_target_assignment_id uuid := null;
  v_trimmed_code text := btrim(coalesce(p_code, ''));
begin
  select *
    into v_learner
    from public.learners
    where secret_hash = btrim(coalesce(p_secret_hash, ''))
    limit 1;

  if not found then
    return jsonb_build_object('error', 'UNAUTHORIZED_LEARNER');
  end if;

  if v_trimmed_code like 'class_assignment:%' then
    begin
      v_target_assignment_id := substring(v_trimmed_code from 18)::uuid;
    exception when others then
      return jsonb_build_object('error', 'STUDY_SET_DISABLED');
    end;

    if v_learner.user_id is null then
      return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
    end if;

    select * into v_assignment
    from public.class_assignments
    where id = v_target_assignment_id
      and kind = 'study'
    limit 1;

    if not found or not public.is_active_class_member(v_assignment.class_id, v_learner.user_id) then
      return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
    end if;

    if v_assignment.closed_at is not null
       or (v_assignment.lock_after_due and v_assignment.due_at is not null and clock_timestamp() > v_assignment.due_at) then
      return jsonb_build_object('error', 'ASSIGNMENT_CLOSED');
    end if;

    select * into v_set
    from public.question_sets
    where id = v_assignment.set_id
    limit 1;
  else
    begin
      v_target_set_id := v_trimmed_code::uuid;
    exception when others then
      v_target_set_id := null;
    end;

    if v_target_set_id is not null and v_learner.user_id is not null then
      select *
        into v_set
        from public.question_sets
        where id = v_target_set_id
          and owner_id = v_learner.user_id
        limit 1;
    end if;

    if v_set.id is null then
      select *
        into v_set
        from public.question_sets
        where upper(study_code) = upper(v_trimmed_code)
          and (
            study_enabled = true
            or (v_learner.user_id is not null and owner_id = v_learner.user_id)
          )
        limit 1;
    end if;
  end if;

  if v_set.id is null then
    return jsonb_build_object('error', 'STUDY_SET_DISABLED');
  end if;

  select *
    into v_question
    from public.questions
    where id = p_question_id
      and set_id = v_set.id
      and status = 'approved'
    limit 1;

  if not found then
    return jsonb_build_object('error', 'QUESTION_NOT_FOUND');
  end if;

  select *
    into v_prev_state
    from public.card_states
    where learner_id = v_learner.id
      and question_id = v_question.id
    for update;

  v_has_prev := found;

  insert into public.card_states (
    learner_id, question_id, due, stability, difficulty,
    elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, updated_at
  )
  values (
    v_learner.id, v_question.id, p_due, p_stability, p_difficulty,
    p_elapsed_days, p_scheduled_days, p_learning_steps, p_reps, p_lapses, p_next_state, p_reviewed_at, clock_timestamp()
  )
  on conflict (learner_id, question_id) do update
  set
    due = excluded.due,
    stability = excluded.stability,
    difficulty = excluded.difficulty,
    elapsed_days = excluded.elapsed_days,
    scheduled_days = excluded.scheduled_days,
    learning_steps = excluded.learning_steps,
    reps = excluded.reps,
    lapses = excluded.lapses,
    state = excluded.state,
    last_review = excluded.last_review,
    updated_at = clock_timestamp();

  insert into public.review_logs (
    learner_id, question_id, rating, state_before, elapsed_days, scheduled_days, reviewed_at
  )
  values (
    v_learner.id, v_question.id, p_rating, p_state_before, p_elapsed_days, p_scheduled_days, p_reviewed_at
  )
  returning id into v_log_id;

  insert into public.learner_set_enrollments (learner_id, set_id, last_studied_at)
  values (v_learner.id, v_set.id, clock_timestamp())
  on conflict (learner_id, set_id) do update
    set last_studied_at = clock_timestamp();

  return jsonb_build_object(
    'error', null,
    'review_log_id', v_log_id,
    'previous_card_state', case
      when v_has_prev then jsonb_build_object(
        'question_id', v_prev_state.question_id,
        'due', v_prev_state.due,
        'stability', v_prev_state.stability,
        'difficulty', v_prev_state.difficulty,
        'elapsed_days', v_prev_state.elapsed_days,
        'scheduled_days', v_prev_state.scheduled_days,
        'learning_steps', v_prev_state.learning_steps,
        'reps', v_prev_state.reps,
        'lapses', v_prev_state.lapses,
        'state', v_prev_state.state,
        'last_review', v_prev_state.last_review
      )
      else null
    end
  );
end;
$$;

-- 8. RPC GIÁO VIÊN GIAO BÀI / CẬP NHẬT / XÓA / XEM TIẾN ĐỘ BÀI GIAO
create or replace function public.create_class_assignment(
  p_class_id uuid,
  p_kind text,
  p_exam_id uuid default null,
  p_set_id uuid default null,
  p_title text default null,
  p_instructions text default null,
  p_due_at timestamptz default null,
  p_lock_after_due boolean default false,
  p_set_exam_class_only boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_class public.classes%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_instructions text := nullif(btrim(coalesce(p_instructions, '')), '');
  v_exam_owner uuid;
  v_set_owner uuid;
  v_approved_count integer := 0;
  v_assignment public.class_assignments%rowtype;
  v_member_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  if not public.is_teacher() then
    return jsonb_build_object('error', 'TEACHER_ONLY');
  end if;

  select * into v_class
  from public.classes
  where id = p_class_id
    and teacher_id = v_uid
  limit 1;

  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
  end if;

  if p_kind not in ('exam', 'study') then
    return jsonb_build_object('error', 'INVALID_KIND');
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 150 then
    return jsonb_build_object('error', 'INVALID_TITLE');
  end if;

  if v_instructions is not null and char_length(v_instructions) > 1000 then
    return jsonb_build_object('error', 'INVALID_INSTRUCTIONS');
  end if;

  if p_kind = 'exam' then
    if p_exam_id is null or p_set_id is not null then
      return jsonb_build_object('error', 'INVALID_TARGET');
    end if;

    select owner_id into v_exam_owner
    from public.exams
    where id = p_exam_id
      and exam_mode = 'online';

    if v_exam_owner is null or v_exam_owner <> v_uid then
      return jsonb_build_object('error', 'TARGET_NOT_OWNED');
    end if;

    if coalesce(p_set_exam_class_only, false) then
      update public.exams
      set access_mode = 'class_only'
      where id = p_exam_id
        and owner_id = v_uid;
    end if;
  else
    if p_set_id is null or p_exam_id is not null then
      return jsonb_build_object('error', 'INVALID_TARGET');
    end if;

    select owner_id into v_set_owner
    from public.question_sets
    where id = p_set_id;

    if v_set_owner is null or v_set_owner <> v_uid then
      return jsonb_build_object('error', 'TARGET_NOT_OWNED');
    end if;

    select count(*)::integer into v_approved_count
    from public.questions
    where set_id = p_set_id
      and status = 'approved';

    if v_approved_count = 0 then
      return jsonb_build_object('error', 'NO_APPROVED_QUESTIONS');
    end if;
  end if;

  insert into public.class_assignments (
    class_id, kind, exam_id, set_id, title, instructions, due_at, lock_after_due
  ) values (
    p_class_id, p_kind, p_exam_id, p_set_id, v_title, v_instructions, p_due_at, coalesce(p_lock_after_due, false)
  )
  returning * into v_assignment;

  -- Gửi thông báo cho toàn bộ học sinh active trong lớp
  for v_member_id in
    select cm.user_id
    from public.class_members cm
    where cm.class_id = p_class_id
      and cm.status = 'active'
  loop
    begin
      insert into public.notifications (user_id, type, title, body, metadata, dedupe_key)
      values (
        v_member_id,
        'system',
        'Bài mới trong lớp ' || v_class.name,
        case when p_kind = 'exam' then 'Giáo viên vừa giao bài kiểm tra "' else 'Giáo viên vừa giao bộ ôn tập "' end
          || v_title || '"'
          || case when p_due_at is not null then ' (hạn: ' || to_char(p_due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') || ').' else '.' end,
        jsonb_build_object('class_id', p_class_id, 'assignment_id', v_assignment.id, 'kind', p_kind),
        'assignment_new_' || v_assignment.id::text
      )
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    exception when others then
      null;
    end;
  end loop;

  return jsonb_build_object(
    'error', null,
    'assignment', to_jsonb(v_assignment)
  );
end;
$$;

revoke all on function public.create_class_assignment(uuid, text, uuid, uuid, text, text, timestamptz, boolean, boolean) from public;
grant execute on function public.create_class_assignment(uuid, text, uuid, uuid, text, text, timestamptz, boolean, boolean) to authenticated;

create or replace function public.update_class_assignment(
  p_assignment_id uuid,
  p_title text default null,
  p_instructions text default null,
  p_update_instructions boolean default false,
  p_due_at timestamptz default null,
  p_update_due_at boolean default false,
  p_lock_after_due boolean default null,
  p_closed boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.class_assignments%rowtype;
  v_next_title text;
  v_updated public.class_assignments%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  if not public.is_teacher() then
    return jsonb_build_object('error', 'TEACHER_ONLY');
  end if;

  select ca.* into v_existing
  from public.class_assignments ca
  join public.classes c on c.id = ca.class_id
  where ca.id = p_assignment_id
    and c.teacher_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
  end if;

  v_next_title := case when p_title is not null then btrim(p_title) else v_existing.title end;
  if char_length(v_next_title) < 1 or char_length(v_next_title) > 150 then
    return jsonb_build_object('error', 'INVALID_TITLE');
  end if;

  update public.class_assignments
  set
    title = v_next_title,
    instructions = case
      when p_update_instructions then nullif(btrim(coalesce(p_instructions, '')), '')
      else instructions
    end,
    due_at = case when p_update_due_at then p_due_at else due_at end,
    lock_after_due = coalesce(p_lock_after_due, lock_after_due),
    closed_at = case
      when p_closed = true then coalesce(closed_at, now())
      when p_closed = false then null
      else closed_at
    end
  where id = p_assignment_id
  returning * into v_updated;

  return jsonb_build_object(
    'error', null,
    'assignment', to_jsonb(v_updated)
  );
end;
$$;

revoke all on function public.update_class_assignment(uuid, text, text, boolean, timestamptz, boolean, boolean, boolean) from public;
grant execute on function public.update_class_assignment(uuid, text, text, boolean, timestamptz, boolean, boolean, boolean) to authenticated;

create or replace function public.get_teacher_class_assignments(
  p_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_active_total integer := 0;
  v_rows jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED', 'assignments', '[]'::jsonb);
  end if;

  if not public.is_teacher() then
    return jsonb_build_object('error', 'TEACHER_ONLY', 'assignments', '[]'::jsonb);
  end if;

  if not exists (
    select 1 from public.classes c where c.id = p_class_id and c.teacher_id = v_uid
  ) then
    return jsonb_build_object('error', 'NOT_FOUND', 'assignments', '[]'::jsonb);
  end if;

  select count(*)::integer into v_active_total
  from public.class_members cm
  where cm.class_id = p_class_id
    and cm.status = 'active';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ca.id,
        'class_id', ca.class_id,
        'kind', ca.kind,
        'exam_id', ca.exam_id,
        'set_id', ca.set_id,
        'title', ca.title,
        'instructions', ca.instructions,
        'due_at', ca.due_at,
        'lock_after_due', ca.lock_after_due,
        'created_at', ca.created_at,
        'closed_at', ca.closed_at,
        'exam_access_mode', e.access_mode,
        'exam_duration_min', e.duration_min,
        'exam_max_attempts', e.max_attempts,
        'exam_total_points', e.total_points,
        'set_title', qs.title,
        'total_active_students', v_active_total,
        'completed_count', case
          when ca.kind = 'exam' then (
            select count(distinct a.student_id)::integer
            from public.attempts a
            join public.class_members cm on cm.class_id = ca.class_id and cm.user_id = a.student_id and cm.status = 'active'
            where a.assignment_id = ca.id
              and a.status in ('submitted', 'expired')
          )
          else (
            select count(distinct l.user_id)::integer
            from public.review_logs rl
            join public.learners l on l.id = rl.learner_id
            join public.questions q on q.id = rl.question_id and q.set_id = ca.set_id and q.status = 'approved'
            join public.class_members cm on cm.class_id = ca.class_id and cm.user_id = l.user_id and cm.status = 'active'
          )
        end,
        'in_progress_count', case
          when ca.kind = 'exam' then (
            select count(distinct a.student_id)::integer
            from public.attempts a
            join public.class_members cm on cm.class_id = ca.class_id and cm.user_id = a.student_id and cm.status = 'active'
            where a.assignment_id = ca.id
              and a.status = 'in_progress'
          )
          else 0
        end
      )
      order by (ca.closed_at is not null) asc, ca.created_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.class_assignments ca
  left join public.exams e on e.id = ca.exam_id
  left join public.question_sets qs on qs.id = ca.set_id
  where ca.class_id = p_class_id;

  return jsonb_build_object(
    'error', null,
    'total_active_students', v_active_total,
    'assignments', v_rows
  );
end;
$$;

revoke all on function public.get_teacher_class_assignments(uuid) from public;
grant execute on function public.get_teacher_class_assignments(uuid) to authenticated;

-- 9. RPC HỌC SINH XEM BÀI ĐƯỢC GIAO (CHỈ KẾT QUẢ CỦA CHÍNH MÌNH + TỰ NHẮC SẮP ĐẾN HẠN KHÔNG TRÙNG)
create or replace function public.get_student_class_assignments(
  p_class_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_learner_id uuid := null;
  v_now timestamptz := clock_timestamp();
  v_rows jsonb;
  v_due_rec record;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED', 'assignments', '[]'::jsonb);
  end if;

  if p_class_id is not null then
    if not public.is_active_class_member(p_class_id, v_uid) then
      return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED', 'assignments', '[]'::jsonb);
    end if;
  end if;

  select l.id into v_learner_id
  from public.learners l
  where l.user_id = v_uid
  limit 1;

  -- Kiểm tra bài sắp đến hạn trong 24 giờ tới để ghi thông báo nhắc (dedupe_key chống trùng, không cần cron)
  for v_due_rec in
    select ca.id, ca.title, ca.due_at, ca.kind, c.name as class_name
    from public.class_assignments ca
    join public.classes c on c.id = ca.class_id
    join public.class_members cm on cm.class_id = ca.class_id and cm.user_id = v_uid and cm.status = 'active'
    where c.archived_at is null
      and ca.closed_at is null
      and ca.due_at is not null
      and ca.due_at > v_now
      and ca.due_at <= v_now + interval '24 hours'
      and (p_class_id is null or ca.class_id = p_class_id)
      and not exists (
        select 1 from public.attempts a
        where a.assignment_id = ca.id
          and a.student_id = v_uid
          and a.status in ('submitted', 'expired')
      )
  loop
    begin
      insert into public.notifications (user_id, type, title, body, metadata, dedupe_key)
      values (
        v_uid,
        'system',
        'Sắp đến hạn nộp bài: ' || v_due_rec.title,
        'Bài "' || v_due_rec.title || '" trong lớp "' || v_due_rec.class_name || '" sẽ hết hạn vào '
          || to_char(v_due_rec.due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') || '.',
        jsonb_build_object('assignment_id', v_due_rec.id, 'due_at', v_due_rec.due_at),
        'assignment_due_24h_' || v_due_rec.id::text
      )
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    exception when others then
      null;
    end;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ca.id,
        'class_id', ca.class_id,
        'class_name', c.name,
        'teacher_name', coalesce(tp.display_name, 'Giáo viên'),
        'kind', ca.kind,
        'exam_id', ca.exam_id,
        'set_id', ca.set_id,
        'title', ca.title,
        'instructions', ca.instructions,
        'due_at', ca.due_at,
        'lock_after_due', ca.lock_after_due,
        'created_at', ca.created_at,
        'closed_at', ca.closed_at,
        'is_locked_now', (
          ca.closed_at is not null
          or (ca.lock_after_due and ca.due_at is not null and v_now > ca.due_at)
        ),
        'duration_min', e.duration_min,
        'max_attempts', e.max_attempts,
        'total_points', e.total_points,
        'show_answers', coalesce(e.show_answers, false),
        'attempts_used', coalesce(att_stats.attempts_used, 0),
        'active_attempt_token', att_stats.active_attempt_token,
        'latest_attempt_token', att_stats.latest_attempt_token,
        'latest_attempt_status', att_stats.latest_attempt_status,
        'latest_score', att_stats.latest_score,
        'latest_submitted_at', att_stats.latest_submitted_at,
        'approved_card_count', case
          when ca.kind = 'study' then (
            select count(*)::integer from public.questions q
            where q.set_id = ca.set_id and q.status = 'approved'
          )
          else 0
        end,
        'reviewed_card_count', case
          when ca.kind = 'study' and v_learner_id is not null then (
            select count(distinct cs.question_id)::integer
            from public.card_states cs
            join public.questions q on q.id = cs.question_id
            where cs.learner_id = v_learner_id
              and q.set_id = ca.set_id
              and q.status = 'approved'
              and cs.reps > 0
          )
          else 0
        end,
        'student_status', case
          when ca.kind = 'exam' then
            case
              when att_stats.has_submitted then 'submitted'
              when att_stats.active_attempt_token is not null then 'in_progress'
              when ca.due_at is not null and v_now > ca.due_at then 'overdue'
              else 'not_started'
            end
          else
            case
              when v_learner_id is not null and exists (
                select 1 from public.card_states cs
                join public.questions q on q.id = cs.question_id
                where cs.learner_id = v_learner_id
                  and q.set_id = ca.set_id
                  and q.status = 'approved'
                  and cs.reps > 0
              ) then 'in_progress'
              when ca.due_at is not null and v_now > ca.due_at then 'overdue'
              else 'not_started'
            end
        end
      )
      order by
        (ca.closed_at is not null) asc,
        (ca.due_at is null) asc,
        ca.due_at asc,
        ca.created_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.class_assignments ca
  join public.classes c on c.id = ca.class_id
  join public.class_members cm on cm.class_id = ca.class_id and cm.user_id = v_uid and cm.status = 'active'
  left join public.profiles tp on tp.id = c.teacher_id
  left join public.exams e on e.id = ca.exam_id
  left join lateral (
    select
      count(*)::integer as attempts_used,
      bool_or(a.status in ('submitted', 'expired')) as has_submitted,
      (
        select a2.attempt_token
        from public.attempts a2
        where a2.assignment_id = ca.id
          and a2.student_id = v_uid
          and a2.status = 'in_progress'
        order by a2.started_at desc
        limit 1
      ) as active_attempt_token,
      (
        select a3.attempt_token
        from public.attempts a3
        where a3.assignment_id = ca.id
          and a3.student_id = v_uid
        order by a3.started_at desc
        limit 1
      ) as latest_attempt_token,
      (
        select a4.status
        from public.attempts a4
        where a4.assignment_id = ca.id
          and a4.student_id = v_uid
        order by a4.started_at desc
        limit 1
      ) as latest_attempt_status,
      (
        select a5.score
        from public.attempts a5
        where a5.assignment_id = ca.id
          and a5.student_id = v_uid
          and a5.status in ('submitted', 'expired')
        order by a5.submitted_at desc nulls last, a5.started_at desc
        limit 1
      ) as latest_score,
      (
        select a6.submitted_at
        from public.attempts a6
        where a6.assignment_id = ca.id
          and a6.student_id = v_uid
          and a6.status in ('submitted', 'expired')
        order by a6.submitted_at desc nulls last
        limit 1
      ) as latest_submitted_at
    from public.attempts a
    where a.assignment_id = ca.id
      and a.student_id = v_uid
  ) att_stats on true
  where c.archived_at is null
    and (p_class_id is null or ca.class_id = p_class_id);

  return jsonb_build_object(
    'error', null,
    'assignments', v_rows,
    'server_now', v_now
  );
end;
$$;

revoke all on function public.get_student_class_assignments(uuid) from public;
grant execute on function public.get_student_class_assignments(uuid) to authenticated;

-- 10. RPC LẤY CẤU TRÚC ĐỂ XÁO TRỘN & BẮT ĐẦU LƯỢT LÀM BÀI KIỂM TRA QUA LỚP
create or replace function public.get_class_exam_structure_for_member(
  p_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.class_assignments%rowtype;
  v_exam public.exams%rowtype;
  v_question_structure jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  select * into v_assignment
  from public.class_assignments
  where id = p_assignment_id
    and kind = 'exam'
  limit 1;

  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
  end if;

  if not public.is_active_class_member(v_assignment.class_id, v_uid) then
    return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
  end if;

  if v_assignment.closed_at is not null then
    return jsonb_build_object('error', 'ASSIGNMENT_CLOSED');
  end if;

  if v_assignment.lock_after_due and v_assignment.due_at is not null and v_now > v_assignment.due_at then
    return jsonb_build_object('error', 'ASSIGNMENT_LOCKED_AFTER_DUE');
  end if;

  select * into v_exam
  from public.exams
  where id = v_assignment.exam_id
  limit 1;

  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
  end if;

  -- Chỉ trả ID vị trí để xáo trộn (KHÔNG trả nội dung câu hỏi hay đáp án)
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
    'error', null,
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'title', v_assignment.title,
      'duration_min', v_exam.duration_min,
      'shuffle_questions', v_exam.shuffle_questions,
      'shuffle_choices', v_exam.shuffle_choices,
      'is_open', v_exam.is_open,
      'show_answers', v_exam.show_answers,
      'max_attempts', v_exam.max_attempts,
      'total_points', v_exam.total_points
    ),
    'question_structure', v_question_structure
  );
end;
$$;

revoke all on function public.get_class_exam_structure_for_member(uuid) from public;
grant execute on function public.get_class_exam_structure_for_member(uuid) to authenticated;

create or replace function public.start_class_exam_attempt(
  p_assignment_id uuid,
  p_attempt_token text,
  p_question_order uuid[],
  p_choice_orders jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.class_assignments%rowtype;
  v_class public.classes%rowtype;
  v_exam public.exams%rowtype;
  v_display_name text;
  v_now timestamptz := clock_timestamp();
  v_existing_in_progress public.attempts%rowtype;
  v_existing_count integer := 0;
  v_deadline timestamptz := null;
  v_attempt_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  if p_attempt_token is null or char_length(btrim(p_attempt_token)) < 32 then
    return jsonb_build_object('error', 'INVALID_TOKEN');
  end if;

  select * into v_assignment
  from public.class_assignments
  where id = p_assignment_id
    and kind = 'exam'
  limit 1;

  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
  end if;

  if not public.is_active_class_member(v_assignment.class_id, v_uid) then
    return jsonb_build_object('error', 'CLASS_ACCESS_REVOKED');
  end if;

  if v_assignment.closed_at is not null then
    return jsonb_build_object('error', 'ASSIGNMENT_CLOSED');
  end if;

  if v_assignment.lock_after_due and v_assignment.due_at is not null and v_now > v_assignment.due_at then
    return jsonb_build_object('error', 'ASSIGNMENT_LOCKED_AFTER_DUE');
  end if;

  select * into v_class from public.classes where id = v_assignment.class_id;
  select * into v_exam from public.exams where id = v_assignment.exam_id;

  if not found then
    return jsonb_build_object('error', 'NOT_FOUND');
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

  -- Khóa nhẹ theo (assignment, user) chống bấm đúp tạo trùng lượt
  perform pg_advisory_xact_lock(hashtext('start_class_attempt:' || p_assignment_id::text || ':' || v_uid::text));

  -- Nếu đang có lượt làm dở (in_progress) chưa quá hạn thì tiếp tục lượt đó
  select * into v_existing_in_progress
  from public.attempts
  where assignment_id = p_assignment_id
    and student_id = v_uid
    and status = 'in_progress'
  order by started_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'error', null,
      'resumed', true,
      'attempt_id', v_existing_in_progress.id,
      'attempt_token', v_existing_in_progress.attempt_token,
      'deadline_at', v_existing_in_progress.deadline_at,
      'server_now', v_now
    );
  end if;

  if v_exam.max_attempts is not null and v_exam.max_attempts > 0 then
    select count(*)::integer into v_existing_count
    from public.attempts
    where assignment_id = p_assignment_id
      and student_id = v_uid;

    if v_existing_count >= v_exam.max_attempts then
      return jsonb_build_object('error', 'MAX_ATTEMPTS_REACHED');
    end if;
  end if;

  select coalesce(p.display_name, 'Học sinh') into v_display_name
  from public.profiles p
  where p.id = v_uid;

  if v_exam.duration_min is not null and v_exam.duration_min > 0 then
    v_deadline := v_now + make_interval(mins => v_exam.duration_min);
  end if;

  if v_exam.closes_at is not null then
    if v_deadline is null or v_exam.closes_at < v_deadline then
      v_deadline := v_exam.closes_at;
    end if;
  end if;

  if v_assignment.lock_after_due and v_assignment.due_at is not null then
    if v_deadline is null or v_assignment.due_at < v_deadline then
      v_deadline := v_assignment.due_at;
    end if;
  end if;

  insert into public.attempts (
    exam_id,
    assignment_id,
    student_id,
    student_name,
    student_class,
    attempt_token,
    started_at,
    deadline_at,
    status,
    question_order,
    choice_orders,
    flagged_questions
  ) values (
    v_exam.id,
    p_assignment_id,
    v_uid,
    coalesce(v_display_name, 'Học sinh'),
    v_class.name,
    btrim(p_attempt_token),
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
    'resumed', false,
    'attempt_id', v_attempt_id,
    'attempt_token', btrim(p_attempt_token),
    'deadline_at', v_deadline,
    'server_now', v_now
  );
end;
$$;

revoke all on function public.start_class_exam_attempt(uuid, text, uuid[], jsonb) from public;
grant execute on function public.start_class_exam_attempt(uuid, text, uuid[], jsonb) to authenticated;

