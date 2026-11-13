-- ============================================================================
-- MemoQuiz - Giai đoạn 3 (Bước 9): Tài khoản học sinh / tự học, Phân quyền vai trò,
-- Hạn mức AI toàn hệ thống, Gộp hồ sơ ẩn danh & Xóa tài khoản
-- ============================================================================

-- 1. Mở rộng profiles: lưu thời điểm đồng ý điều khoản & độ tuổi (>= 16 hoặc có sự đồng ý của cha mẹ)
alter table public.profiles
  add column if not exists consented_at timestamptz;

-- Cập nhật trigger tạo profile khi đăng ký mới:
-- Chỉ chấp nhận 'teacher' hoặc 'student'; mọi giá trị khác từ client đều ép về 'student'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_role text;
  v_consented_at timestamptz := null;
begin
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Người dùng'
  );

  v_role := coalesce(new.raw_user_meta_data->>'role', 'student');
  if v_role not in ('teacher', 'student') then
    v_role := 'student';
  end if;

  if nullif(trim(coalesce(new.raw_user_meta_data->>'consented_at', '')), '') is not null then
    begin
      v_consented_at := (new.raw_user_meta_data->>'consented_at')::timestamptz;
    exception when others then
      v_consented_at := now();
    end;
  end if;

  insert into public.profiles (id, role, display_name, consented_at)
  values (new.id, v_role, v_display_name, v_consented_at)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Hàm kiểm tra vai trò giáo viên cho RLS & RPC
create or replace function public.is_teacher()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'teacher'
  );
$$;

grant execute on function public.is_teacher() to authenticated;

-- 2. Mở rộng exams.exam_mode thêm 'self' (học sinh tự làm bài cá nhân, không mã công khai)
alter table public.exams
  drop constraint if exists exams_exam_mode_check;

alter table public.exams
  add constraint exams_exam_mode_check
  check (exam_mode in ('online', 'print', 'self'));

-- Siết RLS trên exams & exam_versions: chỉ giáo viên được tạo/xem/sửa/xóa đề online & print;
-- học sinh chỉ được tạo/xem/sửa/xóa đề tự làm ('self') của chính mình.
drop policy if exists "exams_owner_all" on public.exams;
drop policy if exists "exams_role_select" on public.exams;
drop policy if exists "exams_role_insert" on public.exams;
drop policy if exists "exams_role_update" on public.exams;
drop policy if exists "exams_role_delete" on public.exams;

create policy "exams_role_select"
  on public.exams for select
  using (
    owner_id = auth.uid()
    and (exam_mode = 'self' or public.is_teacher())
  );

create policy "exams_role_insert"
  on public.exams for insert
  with check (
    owner_id = auth.uid()
    and (exam_mode = 'self' or public.is_teacher())
  );

create policy "exams_role_update"
  on public.exams for update
  using (
    owner_id = auth.uid()
    and (exam_mode = 'self' or public.is_teacher())
  )
  with check (
    owner_id = auth.uid()
    and (exam_mode = 'self' or public.is_teacher())
  );

create policy "exams_role_delete"
  on public.exams for delete
  using (
    owner_id = auth.uid()
    and (exam_mode = 'self' or public.is_teacher())
  );

drop policy if exists "exam_versions_owner_all" on public.exam_versions;
create policy "exam_versions_teacher_all"
  on public.exam_versions for all
  using (
    public.is_teacher()
    and exists (
      select 1 from public.exams e
      where e.id = exam_versions.exam_id
        and e.owner_id = auth.uid()
    )
  )
  with check (
    public.is_teacher()
    and exists (
      select 1 from public.exams e
      where e.id = exam_versions.exam_id
        and e.owner_id = auth.uid()
    )
  );

-- Chặn học sinh bật chia sẻ ôn tập công khai trên question_sets kể cả khi gọi trực tiếp Supabase REST
create or replace function public.prevent_student_study_sharing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and new.study_enabled = true
     and (old.study_enabled is distinct from new.study_enabled or old.study_code is distinct from new.study_code)
     and not public.is_teacher() then
    raise exception 'FORBIDDEN_TEACHER_ONLY';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_student_study_sharing on public.question_sets;
create trigger trg_prevent_student_study_sharing
  before update on public.question_sets
  for each row
  execute procedure public.prevent_student_study_sharing();

-- Siết RPC thống kê lớp học của giáo viên: chỉ role = 'teacher' mới được gọi
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
  if not public.is_teacher() then
    return jsonb_build_object('error', 'FORBIDDEN');
  end if;

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

-- 3. Theo dõi dung lượng file trong source_files để giới hạn tổng Storage mỗi tài khoản
alter table public.source_files
  add column if not exists file_size_bytes bigint not null default 0;

-- 4. Liên kết learners với profiles (user_id) để gắn FSRS với tài khoản đã đăng nhập
alter table public.learners
  add column if not exists user_id uuid unique references public.profiles(id) on delete cascade;

create index if not exists idx_learners_user_id
  on public.learners(user_id)
  where user_id is not null;

-- RPC đảm bảo tài khoản đang đăng nhập luôn có 1 bản ghi learners gắn với auth.uid()
-- Trả về secret_hash nội bộ để server tái dùng các RPC ôn tập Bước 6 (không lộ ra client).
create or replace function public.ensure_account_learner()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_learner public.learners%rowtype;
  v_secret_hash text;
  v_recovery_hash text;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  select *
    into v_learner
    from public.learners
    where user_id = v_user_id
    limit 1;

  if found then
    return jsonb_build_object(
      'error', null,
      'learner_id', v_learner.id,
      'nickname', v_learner.nickname,
      'secret_hash', v_learner.secret_hash
    );
  end if;

  select *
    into v_profile
    from public.profiles
    where id = v_user_id
    limit 1;

  v_secret_hash := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_recovery_hash := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.learners (nickname, secret_hash, recovery_code_hash, user_id)
  values (
    coalesce(nullif(btrim(v_profile.display_name), ''), 'Người học'),
    v_secret_hash,
    v_recovery_hash,
    v_user_id
  )
  returning * into v_learner;

  return jsonb_build_object(
    'error', null,
    'learner_id', v_learner.id,
    'nickname', v_learner.nickname,
    'secret_hash', v_learner.secret_hash
  );
end;
$$;

revoke all on function public.ensure_account_learner() from public;
grant execute on function public.ensure_account_learner() to authenticated;

-- Cập nhật RPC get_learner_study_overview:
-- Nếu learner thuộc tài khoản (user_id is not null) và p_code là UUID của bộ câu hỏi thuộc chính chủ (owner_id = user_id),
-- cho phép ôn tập ngay cả khi study_enabled = false.
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
  v_is_own_set boolean := false;
  v_target_set_id uuid := null;
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
    begin
      v_target_set_id := btrim(p_code)::uuid;
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
        where upper(study_code) = upper(btrim(p_code))
        limit 1;
    end if;

    if v_set.id is null then
      return jsonb_build_object('error', 'STUDY_SET_NOT_FOUND');
    end if;

    v_is_own_set := (v_learner.user_id is not null and v_set.owner_id = v_learner.user_id);

    if not v_set.study_enabled and not v_is_own_set then
      return jsonb_build_object('error', 'STUDY_SET_DISABLED');
    end if;

    insert into public.learner_set_enrollments (learner_id, set_id, last_studied_at)
    values (v_learner.id, v_set.id, clock_timestamp())
    on conflict (learner_id, set_id) do update
      set last_studied_at = clock_timestamp()
    returning * into v_enrollment;

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
        'title', v_set.title,
        'subject', v_set.subject,
        'grade', v_set.grade,
        'study_code', coalesce(v_set.study_code, v_set.id::text),
        'study_enabled', (v_set.study_enabled or v_is_own_set),
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

-- Cập nhật reveal_study_card_hint_or_answer & record_learner_card_review hỗ trợ p_code là set_id (khi học sinh ôn bộ của chính mình)
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
  v_target_set_id uuid := null;
begin
  select *
    into v_learner
    from public.learners
    where secret_hash = btrim(coalesce(p_secret_hash, ''))
    limit 1;

  if not found then
    return jsonb_build_object('error', 'UNAUTHORIZED_LEARNER');
  end if;

  begin
    v_target_set_id := btrim(coalesce(p_code, ''))::uuid;
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
      where upper(study_code) = upper(btrim(coalesce(p_code, '')))
        and (
          study_enabled = true
          or (v_learner.user_id is not null and owner_id = v_learner.user_id)
        )
      limit 1;
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
  v_question public.questions%rowtype;
  v_prev_state public.card_states%rowtype;
  v_has_prev boolean := false;
  v_log_id uuid;
  v_target_set_id uuid := null;
begin
  select *
    into v_learner
    from public.learners
    where secret_hash = btrim(coalesce(p_secret_hash, ''))
    limit 1;

  if not found then
    return jsonb_build_object('error', 'UNAUTHORIZED_LEARNER');
  end if;

  begin
    v_target_set_id := btrim(coalesce(p_code, ''))::uuid;
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
      where upper(study_code) = upper(btrim(coalesce(p_code, '')))
        and (
          study_enabled = true
          or (v_learner.user_id is not null and owner_id = v_learner.user_id)
        )
      limit 1;
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

-- 5. Tổng hợp thẻ cần ôn hôm nay trên tất cả bộ của tài khoản học sinh (/dashboard)
create or replace function public.get_account_study_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_learner_id uuid;
  v_questions jsonb := '[]'::jsonb;
  v_card_states jsonb := '[]'::jsonb;
  v_review_logs jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  select id into v_learner_id
  from public.learners
  where user_id = v_user_id
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'set_id', q.set_id
      )
    ),
    '[]'::jsonb
  )
  into v_questions
  from public.questions q
  join public.question_sets qs on qs.id = q.set_id
  where qs.owner_id = v_user_id
    and q.status = 'approved';

  if v_learner_id is not null then
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
    where cs.learner_id = v_learner_id;

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
    where rl.learner_id = v_learner_id
      and rl.reviewed_at >= clock_timestamp() - interval '35 days';
  end if;

  return jsonb_build_object(
    'error', null,
    'questions', v_questions,
    'card_states', v_card_states,
    'review_logs', v_review_logs,
    'server_now', clock_timestamp()
  );
end;
$$;

revoke all on function public.get_account_study_summary() from public;
grant execute on function public.get_account_study_summary() to authenticated;

-- 6. Gộp hồ sơ ôn tập ẩn danh cũ vào tài khoản bằng mã khôi phục (1 lần, giữ thẻ mới hơn, không trùng)
create or replace function public.merge_anonymous_learner(
  p_recovery_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ensured jsonb;
  v_target_learner_id uuid;
  v_source_learner public.learners%rowtype;
  v_merged_cards integer := 0;
  v_moved_logs integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  if p_recovery_code_hash is null or btrim(p_recovery_code_hash) = '' then
    return jsonb_build_object('error', 'INVALID_RECOVERY_CODE');
  end if;

  v_ensured := public.ensure_account_learner();
  v_target_learner_id := (v_ensured->>'learner_id')::uuid;

  select *
    into v_source_learner
    from public.learners
    where recovery_code_hash = btrim(p_recovery_code_hash)
      and user_id is null
    for update;

  if not found then
    return jsonb_build_object('error', 'RECOVERY_CODE_NOT_FOUND');
  end if;

  -- Gộp enrollments
  insert into public.learner_set_enrollments (
    learner_id, set_id, daily_new_limit, leech_threshold, joined_at, last_studied_at
  )
  select
    v_target_learner_id, set_id, daily_new_limit, leech_threshold, joined_at, last_studied_at
  from public.learner_set_enrollments
  where learner_id = v_source_learner.id
  on conflict (learner_id, set_id) do update
  set
    last_studied_at = greatest(excluded.last_studied_at, public.learner_set_enrollments.last_studied_at),
    joined_at = least(excluded.joined_at, public.learner_set_enrollments.joined_at);

  -- Gộp card_states: giữ bản có last_review (hoặc updated_at) mới hơn
  with upserted as (
    insert into public.card_states (
      learner_id, question_id, due, stability, difficulty,
      elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, updated_at
    )
    select
      v_target_learner_id, question_id, due, stability, difficulty,
      elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, updated_at
    from public.card_states
    where learner_id = v_source_learner.id
    on conflict (learner_id, question_id) do update
    set
      due = case
        when coalesce(excluded.last_review, excluded.updated_at) > coalesce(public.card_states.last_review, public.card_states.updated_at)
        then excluded.due else public.card_states.due end,
      stability = case
        when coalesce(excluded.last_review, excluded.updated_at) > coalesce(public.card_states.last_review, public.card_states.updated_at)
        then excluded.stability else public.card_states.stability end,
      difficulty = case
        when coalesce(excluded.last_review, excluded.updated_at) > coalesce(public.card_states.last_review, public.card_states.updated_at)
        then excluded.difficulty else public.card_states.difficulty end,
      elapsed_days = case
        when coalesce(excluded.last_review, excluded.updated_at) > coalesce(public.card_states.last_review, public.card_states.updated_at)
        then excluded.elapsed_days else public.card_states.elapsed_days end,
      scheduled_days = case
        when coalesce(excluded.last_review, excluded.updated_at) > coalesce(public.card_states.last_review, public.card_states.updated_at)
        then excluded.scheduled_days else public.card_states.scheduled_days end,
      learning_steps = case
        when coalesce(excluded.last_review, excluded.updated_at) > coalesce(public.card_states.last_review, public.card_states.updated_at)
        then excluded.learning_steps else public.card_states.learning_steps end,
      reps = case
        when coalesce(excluded.last_review, excluded.updated_at) > coalesce(public.card_states.last_review, public.card_states.updated_at)
        then excluded.reps else public.card_states.reps end,
      lapses = case
        when coalesce(excluded.last_review, excluded.updated_at) > coalesce(public.card_states.last_review, public.card_states.updated_at)
        then excluded.lapses else public.card_states.lapses end,
      state = case
        when coalesce(excluded.last_review, excluded.updated_at) > coalesce(public.card_states.last_review, public.card_states.updated_at)
        then excluded.state else public.card_states.state end,
      last_review = case
        when coalesce(excluded.last_review, excluded.updated_at) > coalesce(public.card_states.last_review, public.card_states.updated_at)
        then excluded.last_review else public.card_states.last_review end,
      updated_at = greatest(excluded.updated_at, public.card_states.updated_at)
    returning 1
  )
  select count(*) into v_merged_cards from upserted;

  -- Chuyển review_logs & attempts sang learner tài khoản
  update public.review_logs
  set learner_id = v_target_learner_id
  where learner_id = v_source_learner.id;
  get diagnostics v_moved_logs = row_count;

  update public.attempts
  set learner_id = v_target_learner_id
  where learner_id = v_source_learner.id;

  -- Xóa hồ sơ ẩn danh cũ để chỉ gộp đúng 1 lần
  delete from public.learners
  where id = v_source_learner.id;

  return jsonb_build_object(
    'error', null,
    'merged_cards', v_merged_cards,
    'moved_logs', v_moved_logs
  );
end;
$$;

revoke all on function public.merge_anonymous_learner(text) from public;
grant execute on function public.merge_anonymous_learner(text) to authenticated;

-- 7. Hạn mức AI toàn hệ thống theo ngày (atomic)
create table if not exists public.ai_global_usage (
  date date primary key default current_date,
  calls integer not null default 0,
  tokens integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.ai_global_usage enable row level security;
-- Chỉ truy cập qua RPC SECURITY DEFINER

create or replace function public.consume_ai_quota_v2(
  p_user_limit integer default 30,
  p_global_limit integer default 500,
  p_tokens integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_calls integer := 0;
  v_tokens integer := 0;
  v_global_calls integer := 0;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_global_limit <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'GLOBAL_LIMIT',
      'calls', 0,
      'remaining', 0
    );
  end if;

  if p_user_limit <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'USER_LIMIT',
      'calls', 0,
      'remaining', 0
    );
  end if;

  -- 1. Kiểm tra & tăng bộ đếm toàn hệ thống trước
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
      'calls', p_global_limit,
      'remaining', 0
    );
  end if;

  -- 2. Kiểm tra & tăng bộ đếm cá nhân
  insert into public.ai_usage (user_id, date, calls, tokens)
  values (v_user_id, current_date, 1, greatest(0, p_tokens))
  on conflict (user_id, date) do update
    set calls = public.ai_usage.calls + 1,
        tokens = public.ai_usage.tokens + greatest(0, p_tokens)
    where public.ai_usage.calls < p_user_limit
  returning calls, tokens into v_calls, v_tokens;

  if not found then
    -- Hoàn trả 1 lượt vào bộ đếm toàn hệ thống vì người dùng đã chạm ngưỡng riêng
    update public.ai_global_usage
      set calls = greatest(0, calls - 1),
          updated_at = clock_timestamp()
      where date = current_date;

    select coalesce(calls, p_user_limit), coalesce(tokens, 0)
      into v_calls, v_tokens
      from public.ai_usage
      where user_id = v_user_id and date = current_date;

    return jsonb_build_object(
      'allowed', false,
      'reason', 'USER_LIMIT',
      'calls', v_calls,
      'tokens', v_tokens,
      'remaining', 0
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'calls', v_calls,
    'tokens', v_tokens,
    'remaining', greatest(0, p_user_limit - v_calls),
    'global_calls', v_global_calls
  );
end;
$$;

revoke all on function public.consume_ai_quota_v2(integer, integer, integer) from public;
grant execute on function public.consume_ai_quota_v2(integer, integer, integer) to authenticated;

-- 8. Xóa toàn bộ tài khoản và dữ liệu của chính người dùng đang đăng nhập
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

  delete from auth.users
  where id = v_user_id;

  return jsonb_build_object('error', null);
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

