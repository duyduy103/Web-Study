-- ============================================================================
-- MemoQuiz - Giai đoạn 2 (Bước 6): Chế độ ôn tập khoa học (Active Recall, FSRS, Pomodoro & Thống kê)
-- ============================================================================

-- 1. Mở rộng bảng public.question_sets để giáo viên bật/tắt chế độ ôn tập (/study/[code])
alter table public.question_sets
  add column if not exists study_enabled boolean not null default false,
  add column if not exists study_code text unique;

create unique index if not exists idx_question_sets_study_code_upper
  on public.question_sets (upper(study_code))
  where study_code is not null;

-- 2. Bảng hồ sơ học sinh ẩn danh (public.learners)
create table if not exists public.learners (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(btrim(nickname)) between 1 and 60),
  secret_hash text not null unique,
  recovery_code_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_learners_secret_hash on public.learners(secret_hash);
create index if not exists idx_learners_recovery_code_hash on public.learners(recovery_code_hash);

alter table public.learners enable row level security;
-- Không mở policy trực tiếp cho anon trên learners; mọi truy cập đi qua RPC SECURITY DEFINER kiểm tra băm khóa

-- 3. Liên kết tùy chọn từ public.attempts (Bước 5) sang public.learners
alter table public.attempts
  add column if not exists learner_id uuid references public.learners(id) on delete set null;

create index if not exists idx_attempts_learner_id on public.attempts(learner_id);

-- 4. Bảng ghi nhận bộ câu hỏi học sinh đã tham gia ôn tập & cấu hình cá nhân
create table if not exists public.learner_set_enrollments (
  learner_id uuid not null references public.learners(id) on delete cascade,
  set_id uuid not null references public.question_sets(id) on delete cascade,
  daily_new_limit integer not null default 20 check (daily_new_limit between 5 and 50),
  leech_threshold integer not null default 3 check (leech_threshold between 2 and 10),
  joined_at timestamptz not null default now(),
  last_studied_at timestamptz not null default now(),
  primary key (learner_id, set_id)
);

create index if not exists idx_learner_set_enrollments_set_id
  on public.learner_set_enrollments(set_id);

alter table public.learner_set_enrollments enable row level security;

create policy "learner_set_enrollments_teacher_select"
  on public.learner_set_enrollments for select
  using (
    exists (
      select 1 from public.question_sets qs
      where qs.id = learner_set_enrollments.set_id
        and qs.owner_id = auth.uid()
    )
  );

-- 5. Bảng trạng thái thẻ FSRS (public.card_states)
create table if not exists public.card_states (
  learner_id uuid not null references public.learners(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  learning_steps integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0 check (state in (0, 1, 2, 3)),
  last_review timestamptz,
  updated_at timestamptz not null default now(),
  primary key (learner_id, question_id)
);

create index if not exists idx_card_states_learner_due
  on public.card_states(learner_id, due);
create index if not exists idx_card_states_question_id
  on public.card_states(question_id);

alter table public.card_states enable row level security;

create policy "card_states_teacher_select"
  on public.card_states for select
  using (
    exists (
      select 1 from public.questions q
      join public.question_sets qs on qs.id = q.set_id
      where q.id = card_states.question_id
        and qs.owner_id = auth.uid()
    )
  );

-- 6. Bảng lịch sử ôn tập FSRS (public.review_logs)
create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  rating smallint not null check (rating in (1, 2, 3, 4)),
  state_before smallint not null default 0 check (state_before in (0, 1, 2, 3)),
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reviewed_at timestamptz not null default now()
);

create index if not exists idx_review_logs_learner_reviewed_at
  on public.review_logs(learner_id, reviewed_at desc);
create index if not exists idx_review_logs_question_id
  on public.review_logs(question_id);

alter table public.review_logs enable row level security;

create policy "review_logs_teacher_select"
  on public.review_logs for select
  using (
    exists (
      select 1 from public.questions q
      join public.question_sets qs on qs.id = q.set_id
      where q.id = review_logs.question_id
        and qs.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- 7. CÁC HÀM RPC BẢO MẬT (SECURITY DEFINER) CHO HỒ SƠ ẨN DANH & ÔN TẬP KHOA HỌC
-- ============================================================================

-- 7.1. Tạo hồ sơ học sinh ẩn danh mới
create or replace function public.create_anonymous_learner(
  p_nickname text,
  p_secret_hash text,
  p_recovery_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean_nick text := btrim(coalesce(p_nickname, ''));
  v_learner public.learners%rowtype;
begin
  if v_clean_nick = '' or char_length(v_clean_nick) > 60 then
    return jsonb_build_object('error', 'INVALID_NICKNAME');
  end if;

  if p_secret_hash is null or char_length(p_secret_hash) < 32
     or p_recovery_code_hash is null or char_length(p_recovery_code_hash) < 32 then
    return jsonb_build_object('error', 'INVALID_HASH');
  end if;

  insert into public.learners (nickname, secret_hash, recovery_code_hash)
  values (v_clean_nick, p_secret_hash, p_recovery_code_hash)
  returning * into v_learner;

  return jsonb_build_object(
    'error', null,
    'learner', jsonb_build_object(
      'id', v_learner.id,
      'nickname', v_learner.nickname,
      'created_at', v_learner.created_at
    )
  );
end;
$$;

grant execute on function public.create_anonymous_learner(text, text, text) to anon, authenticated;

-- 7.2. Khôi phục hồ sơ trên thiết bị mới bằng mã khôi phục (cấp secret_hash mới cho thiết bị)
create or replace function public.recover_learner_by_code(
  p_recovery_code_hash text,
  p_new_secret_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_learner public.learners%rowtype;
begin
  if p_recovery_code_hash is null or btrim(p_recovery_code_hash) = ''
     or p_new_secret_hash is null or char_length(p_new_secret_hash) < 32 then
    return jsonb_build_object('error', 'INVALID_RECOVERY_CODE');
  end if;

  update public.learners
  set secret_hash = p_new_secret_hash
  where recovery_code_hash = btrim(p_recovery_code_hash)
  returning * into v_learner;

  if not found then
    return jsonb_build_object('error', 'RECOVERY_CODE_NOT_FOUND');
  end if;

  return jsonb_build_object(
    'error', null,
    'learner', jsonb_build_object(
      'id', v_learner.id,
      'nickname', v_learner.nickname,
      'created_at', v_learner.created_at
    )
  );
end;
$$;

grant execute on function public.recover_learner_by_code(text, text) to anon, authenticated;

-- 7.3. Lấy thông tin công khai của bộ ôn tập theo mã (không chứa câu hỏi hay đáp án)
create or replace function public.get_public_study_set_by_code(
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.question_sets%rowtype;
  v_approved_count integer := 0;
begin
  if p_code is null or btrim(p_code) = '' then
    return null;
  end if;

  select *
    into v_set
    from public.question_sets
    where upper(study_code) = upper(btrim(p_code))
    limit 1;

  if not found then
    return null;
  end if;

  if not v_set.study_enabled then
    return jsonb_build_object(
      'id', v_set.id,
      'title', v_set.title,
      'subject', v_set.subject,
      'grade', v_set.grade,
      'study_code', v_set.study_code,
      'study_enabled', false,
      'approved_count', 0
    );
  end if;

  select count(*)
    into v_approved_count
    from public.questions q
    where q.set_id = v_set.id
      and q.status = 'approved';

  return jsonb_build_object(
    'id', v_set.id,
    'title', v_set.title,
    'subject', v_set.subject,
    'grade', v_set.grade,
    'study_code', v_set.study_code,
    'study_enabled', true,
    'approved_count', v_approved_count
  );
end;
$$;

grant execute on function public.get_public_study_set_by_code(text) to anon, authenticated;

-- 7.4. Tải dữ liệu tổng quan ôn tập của học sinh (không bao giờ trả về đáp án hay lựa chọn của câu hỏi)
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
  v_enrollment public.learner_set_enrollments%rowtype;
  v_questions jsonb := '[]'::jsonb;
  v_card_states jsonb := '[]'::jsonb;
  v_review_logs jsonb := '[]'::jsonb;
  v_enrolled_sets jsonb := '[]'::jsonb;
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

  if p_code is not null and btrim(p_code) <> '' then
    select *
      into v_set
      from public.question_sets
      where upper(study_code) = upper(btrim(p_code))
      limit 1;

    if not found then
      return jsonb_build_object('error', 'STUDY_SET_NOT_FOUND');
    end if;

    if not v_set.study_enabled then
      return jsonb_build_object('error', 'STUDY_SET_DISABLED');
    end if;

    insert into public.learner_set_enrollments (learner_id, set_id, last_studied_at)
    values (v_learner.id, v_set.id, clock_timestamp())
    on conflict (learner_id, set_id) do update
      set last_studied_at = clock_timestamp()
    returning * into v_enrollment;

    -- Chỉ lấy các câu approved của bộ này, CHỈ gồm id, type, stem, topic, difficulty (TUYỆT ĐỐI KHÔNG CÓ choices/answer_text)
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

  -- Lịch sử ôn tập của học sinh trong 30 ngày gần nhất (dùng tính streak, thống kê 14 ngày & số thẻ mới đã học hôm nay)
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

  -- Danh sách các bộ câu hỏi học sinh đã tham gia (cho trang /study)
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
    and qs.study_enabled = true
    and qs.study_code is not null;

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
        'title', v_set.title,
        'subject', v_set.subject,
        'grade', v_set.grade,
        'study_code', v_set.study_code,
        'study_enabled', v_set.study_enabled,
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

grant execute on function public.get_learner_study_overview(text, text) to anon, authenticated;

-- 7.5. Cập nhật giới hạn thẻ mới/ngày (5-50) và ngưỡng câu hay quên (leech_threshold)
create or replace function public.update_learner_study_settings(
  p_secret_hash text,
  p_set_id uuid,
  p_daily_new_limit integer,
  p_leech_threshold integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_learner public.learners%rowtype;
  v_clamped_limit integer := least(50, greatest(5, coalesce(p_daily_new_limit, 20)));
  v_clamped_leech integer := least(10, greatest(2, coalesce(p_leech_threshold, 3)));
begin
  select *
    into v_learner
    from public.learners
    where secret_hash = btrim(coalesce(p_secret_hash, ''))
    limit 1;

  if not found then
    return jsonb_build_object('error', 'UNAUTHORIZED_LEARNER');
  end if;

  update public.learner_set_enrollments
  set
    daily_new_limit = v_clamped_limit,
    leech_threshold = v_clamped_leech
  where learner_id = v_learner.id
    and set_id = p_set_id;

  return jsonb_build_object(
    'error', null,
    'daily_new_limit', v_clamped_limit,
    'leech_threshold', v_clamped_leech
  );
end;
$$;

grant execute on function public.update_learner_study_settings(text, uuid, integer, integer) to anon, authenticated;

-- 7.6. Lộ gợi ý lựa chọn (không lộ đáp án đúng) HOẶC lộ đáp án cho ĐÚNG MỘT THẺ đang học
-- Bảo mật: Chỉ trả về dữ liệu của 1 câu hỏi khi người học bấm nút trên thẻ đó
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
  v_question public.questions%rowtype;
  v_choices jsonb := '[]'::jsonb;
  v_answer public.answers%rowtype;
begin
  select *
    into v_learner
    from public.learners
    where secret_hash = btrim(coalesce(p_secret_hash, ''))
    limit 1;

  if not found then
    return jsonb_build_object('error', 'UNAUTHORIZED_LEARNER');
  end if;

  select *
    into v_set
    from public.question_sets
    where upper(study_code) = upper(btrim(coalesce(p_code, '')))
      and study_enabled = true
    limit 1;

  if not found then
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
    -- Chỉ trả danh sách lựa chọn để gợi ý, TUYỆT ĐỐI KHÔNG TRẢ is_correct hay explanation
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

  -- p_mode = 'answer': trả đầy đủ đáp án và giải thích cho đúng câu hỏi này
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

grant execute on function public.reveal_study_card_hint_or_answer(text, text, uuid, text) to anon, authenticated;

-- 7.7. Ghi nhận kết quả tự chấm 1 thẻ FSRS (cập nhật card_states + thêm dòng review_logs nguyên tử)
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
  v_question public.questions%rowtype;
  v_prev_state public.card_states%rowtype;
  v_has_prev boolean := false;
  v_log_id uuid;
begin
  select *
    into v_learner
    from public.learners
    where secret_hash = btrim(coalesce(p_secret_hash, ''))
    limit 1;

  if not found then
    return jsonb_build_object('error', 'UNAUTHORIZED_LEARNER');
  end if;

  select *
    into v_set
    from public.question_sets
    where upper(study_code) = upper(btrim(coalesce(p_code, '')))
      and study_enabled = true
    limit 1;

  if not found then
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
    learner_id,
    question_id,
    due,
    stability,
    difficulty,
    elapsed_days,
    scheduled_days,
    learning_steps,
    reps,
    lapses,
    state,
    last_review,
    updated_at
  )
  values (
    v_learner.id,
    v_question.id,
    p_due,
    p_stability,
    p_difficulty,
    p_elapsed_days,
    p_scheduled_days,
    p_learning_steps,
    p_reps,
    p_lapses,
    p_next_state,
    p_reviewed_at,
    clock_timestamp()
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
    learner_id,
    question_id,
    rating,
    state_before,
    elapsed_days,
    scheduled_days,
    reviewed_at
  )
  values (
    v_learner.id,
    v_question.id,
    p_rating,
    p_state_before,
    p_elapsed_days,
    p_scheduled_days,
    p_reviewed_at
  )
  returning id into v_log_id;

  update public.learner_set_enrollments
  set last_studied_at = clock_timestamp()
  where learner_id = v_learner.id
    and set_id = v_set.id;

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

grant execute on function public.record_learner_card_review(
  text, text, uuid, smallint, smallint, integer, integer, timestamptz,
  double precision, double precision, integer, integer, integer, smallint, timestamptz
) to anon, authenticated;

-- 7.8. Hoàn tác 1 bước thẻ vừa chấm (Undo)
create or replace function public.undo_learner_card_review(
  p_secret_hash text,
  p_review_log_id uuid,
  p_question_id uuid,
  p_previous_card_state jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_learner public.learners%rowtype;
begin
  select *
    into v_learner
    from public.learners
    where secret_hash = btrim(coalesce(p_secret_hash, ''))
    limit 1;

  if not found then
    return jsonb_build_object('error', 'UNAUTHORIZED_LEARNER');
  end if;

  delete from public.review_logs
  where id = p_review_log_id
    and learner_id = v_learner.id
    and question_id = p_question_id;

  if not found then
    return jsonb_build_object('error', 'REVIEW_LOG_NOT_FOUND');
  end if;

  if p_previous_card_state is null or jsonb_typeof(p_previous_card_state) = 'null' then
    delete from public.card_states
    where learner_id = v_learner.id
      and question_id = p_question_id;
  else
    update public.card_states
    set
      due = (p_previous_card_state->>'due')::timestamptz,
      stability = coalesce((p_previous_card_state->>'stability')::double precision, 0),
      difficulty = coalesce((p_previous_card_state->>'difficulty')::double precision, 0),
      elapsed_days = coalesce((p_previous_card_state->>'elapsed_days')::integer, 0),
      scheduled_days = coalesce((p_previous_card_state->>'scheduled_days')::integer, 0),
      learning_steps = coalesce((p_previous_card_state->>'learning_steps')::integer, 0),
      reps = coalesce((p_previous_card_state->>'reps')::integer, 0),
      lapses = coalesce((p_previous_card_state->>'lapses')::integer, 0),
      state = coalesce((p_previous_card_state->>'state')::smallint, 0),
      last_review = case
        when p_previous_card_state->>'last_review' is not null
        then (p_previous_card_state->>'last_review')::timestamptz
        else null
      end,
      updated_at = clock_timestamp()
    where learner_id = v_learner.id
      and question_id = p_question_id;
  end if;

  return jsonb_build_object('error', null);
end;
$$;

grant execute on function public.undo_learner_card_review(text, uuid, uuid, jsonb) to anon, authenticated;

-- 7.9. Thống kê ôn tập dành cho giáo viên sở hữu bộ câu hỏi (SECURITY DEFINER có kiểm tra auth.uid())
create or replace function public.get_teacher_set_study_stats(
  p_set_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.question_sets%rowtype;
  v_learner_count integer := 0;
  v_total_reviews integer := 0;
  v_remembered_reviews integer := 0;
  v_question_stats jsonb := '[]'::jsonb;
  v_learners_list jsonb := '[]'::jsonb;
begin
  select *
    into v_set
    from public.question_sets
    where id = p_set_id
      and owner_id = auth.uid()
    limit 1;

  if not found then
    return jsonb_build_object('error', 'FORBIDDEN');
  end if;

  select count(*)
    into v_learner_count
    from public.learner_set_enrollments lse
    where lse.set_id = v_set.id;

  select
    count(*),
    count(*) filter (where rl.rating in (2, 3, 4))
    into v_total_reviews, v_remembered_reviews
    from public.review_logs rl
    join public.questions q on q.id = rl.question_id
    where q.set_id = v_set.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'question_id', q.id,
        'stem', q.stem,
        'topic', q.topic,
        'type', q.type,
        'total_lapses', coalesce(cs_agg.total_lapses, 0),
        'leech_learners_count', coalesce(cs_agg.leech_learners_count, 0),
        'again_reviews_count', coalesce(rl_agg.again_count, 0),
        'total_reviews_count', coalesce(rl_agg.total_count, 0)
      )
      order by coalesce(cs_agg.total_lapses, 0) desc, coalesce(rl_agg.again_count, 0) desc
    ),
    '[]'::jsonb
  )
  into v_question_stats
  from public.questions q
  left join (
    select
      question_id,
      sum(lapses)::integer as total_lapses,
      count(*) filter (where lapses >= 3)::integer as leech_learners_count
    from public.card_states
    group by question_id
  ) cs_agg on cs_agg.question_id = q.id
  left join (
    select
      question_id,
      count(*) filter (where rating = 1)::integer as again_count,
      count(*)::integer as total_count
    from public.review_logs
    group by question_id
  ) rl_agg on rl_agg.question_id = q.id
  where q.set_id = v_set.id
    and q.status = 'approved';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'learner_id', l.id,
        'nickname', l.nickname,
        'last_studied_at', lse.last_studied_at,
        'cards_learned', (
          select count(*) from public.card_states cs
          join public.questions q2 on q2.id = cs.question_id
          where cs.learner_id = l.id and q2.set_id = v_set.id
        ),
        'leech_count', (
          select count(*) from public.card_states cs
          join public.questions q2 on q2.id = cs.question_id
          where cs.learner_id = l.id and q2.set_id = v_set.id and cs.lapses >= 3
        )
      )
      order by lse.last_studied_at desc
    ),
    '[]'::jsonb
  )
  into v_learners_list
  from public.learner_set_enrollments lse
  join public.learners l on l.id = lse.learner_id
  where lse.set_id = v_set.id;

  return jsonb_build_object(
    'error', null,
    'learner_count', v_learner_count,
    'total_reviews', v_total_reviews,
    'average_retention_rate', case
      when v_total_reviews > 0 then round((v_remembered_reviews::numeric / v_total_reviews::numeric) * 100, 1)
      else 0
    end,
    'question_stats', v_question_stats,
    'learners', v_learners_list
  );
end;
$$;

grant execute on function public.get_teacher_set_study_stats(uuid) to authenticated;

-- 7.10. Liên kết tùy chọn lượt làm bài kiểm tra (attempt) với hồ sơ học sinh ẩn danh (learner)
create or replace function public.link_attempt_to_learner(
  p_attempt_token text,
  p_secret_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_learner_id uuid;
begin
  select id
    into v_learner_id
    from public.learners
    where secret_hash = btrim(coalesce(p_secret_hash, ''))
    limit 1;

  if v_learner_id is not null then
    update public.attempts
    set learner_id = v_learner_id
    where attempt_token = btrim(coalesce(p_attempt_token, ''))
      and learner_id is null;
  end if;
end;
$$;

grant execute on function public.link_attempt_to_learner(text, text) to anon, authenticated;
