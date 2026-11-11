-- ============================================================================
-- MemoQuiz - Giai đoạn 1: Khởi tạo cơ sở dữ liệu & Row Level Security (RLS)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. BẢNG DỮ LIỆU (12 bảng Giai đoạn 1)
-- ============================================================================

-- 1.1. profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'teacher' check (role in ('teacher', 'student')),
  display_name text not null,
  created_at timestamptz not null default now()
);

-- 1.2. question_sets
create table public.question_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  subject text,
  grade text,
  source_file_hash text,
  created_at timestamptz not null default now()
);

-- 1.3. source_files
create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.question_sets(id) on delete cascade,
  storage_path text not null,
  file_hash text not null,
  mime_type text not null,
  page_count integer,
  created_at timestamptz not null default now()
);

-- 1.4. questions
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.question_sets(id) on delete cascade,
  type text not null check (type in ('mcq', 'true_false', 'cloze', 'short_answer')),
  stem text not null,
  explanation text,
  source_ref text,
  topic text,
  difficulty text,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  created_at timestamptz not null default now()
);

-- 1.5. choices (dành cho mcq, true_false)
create table public.choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  text text not null,
  is_correct boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- 1.6. answers (dành cho short_answer, cloze)
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  answer_text text not null,
  accepted_variants text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- 1.7. exams
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  set_id uuid references public.question_sets(id) on delete set null,
  title text not null,
  duration_min integer,
  shuffle_questions boolean not null default true,
  shuffle_choices boolean not null default true,
  created_at timestamptz not null default now()
);

-- 1.8. exam_questions
create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  points numeric(5,2) not null default 1.0,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (exam_id, question_id)
);

-- 1.9. exam_versions
create table public.exam_versions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  code text not null,
  question_order uuid[] not null default '{}',
  choice_orders jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 1.10. attempts
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id) on delete cascade,
  set_id uuid references public.question_sets(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(5,2),
  created_at timestamptz not null default now(),
  check (exam_id is not null or set_id is not null)
);

-- 1.11. attempt_answers
create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  response text,
  is_correct boolean,
  ai_feedback text,
  created_at timestamptz not null default now()
);

-- 1.12. ai_usage
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null default current_date,
  calls integer not null default 0,
  tokens integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ============================================================================
-- 2. INDEX CHO KHÓA NGOẠI VÀ CỘT HAY LỌC
-- ============================================================================

create index idx_question_sets_owner_id on public.question_sets(owner_id);
create index idx_question_sets_source_file_hash on public.question_sets(source_file_hash);

create index idx_source_files_set_id on public.source_files(set_id);
create index idx_source_files_file_hash on public.source_files(file_hash);

create index idx_questions_set_id on public.questions(set_id);
create index idx_questions_status on public.questions(status);
create index idx_questions_set_id_status on public.questions(set_id, status);

create index idx_choices_question_id on public.choices(question_id);
create index idx_answers_question_id on public.answers(question_id);

create index idx_exams_owner_id on public.exams(owner_id);
create index idx_exams_set_id on public.exams(set_id);

create index idx_exam_questions_exam_id on public.exam_questions(exam_id);
create index idx_exam_questions_question_id on public.exam_questions(question_id);

create index idx_exam_versions_exam_id on public.exam_versions(exam_id);

create index idx_attempts_exam_id on public.attempts(exam_id);
create index idx_attempts_set_id on public.attempts(set_id);
create index idx_attempts_student_id on public.attempts(student_id);

create index idx_attempt_answers_attempt_id on public.attempt_answers(attempt_id);
create index idx_attempt_answers_question_id on public.attempt_answers(question_id);

create index idx_ai_usage_user_id_date on public.ai_usage(user_id, date);

-- ============================================================================
-- 3. TRIGGER TỰ TẠO DÒNG PROFILES KHI ĐĂNG KÝ TÀI KHOẢN MỚI
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_role text;
begin
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Giáo viên'
  );

  v_role := coalesce(new.raw_user_meta_data->>'role', 'teacher');
  if v_role not in ('teacher', 'student') then
    v_role := 'teacher';
  end if;

  insert into public.profiles (id, role, display_name)
  values (new.id, v_role, v_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- 4. BẬT ROW LEVEL SECURITY (RLS) CHO TOÀN BỘ 12 BẢNG
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.question_sets enable row level security;
alter table public.source_files enable row level security;
alter table public.questions enable row level security;
alter table public.choices enable row level security;
alter table public.answers enable row level security;
alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_versions enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.ai_usage enable row level security;

-- ============================================================================
-- 5. POLICIES CHO TỪNG BẢNG
-- ============================================================================

-- 5.1. profiles: mỗi người chỉ đọc và sửa dòng của chính mình
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- TODO: Khi có tính năng lớp học (GĐ4), mở rộng policy để giáo viên xem được hồ sơ học sinh trong lớp của mình.

-- 5.2. question_sets: giáo viên toàn quyền với bộ câu hỏi do mình sở hữu
create policy "question_sets_owner_all"
  on public.question_sets for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- TODO: Khi làm quiz/ôn tập cho học sinh, thêm policy SELECT cho học sinh được giao bài.

-- 5.3. source_files: kiểm tra quyền qua question_sets cha
create policy "source_files_owner_all"
  on public.source_files for all
  using (
    exists (
      select 1 from public.question_sets qs
      where qs.id = source_files.set_id
        and qs.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.question_sets qs
      where qs.id = source_files.set_id
        and qs.owner_id = auth.uid()
    )
  );

-- 5.4. questions: kiểm tra quyền qua question_sets cha
create policy "questions_owner_all"
  on public.questions for all
  using (
    exists (
      select 1 from public.question_sets qs
      where qs.id = questions.set_id
        and qs.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.question_sets qs
      where qs.id = questions.set_id
        and qs.owner_id = auth.uid()
    )
  );

-- TODO: Khi mở cho học sinh làm bài/ôn tập, thêm policy SELECT chỉ cho phép đọc câu hỏi có status = 'approved'.

-- 5.5. choices: kiểm tra quyền qua questions -> question_sets cha
create policy "choices_owner_all"
  on public.choices for all
  using (
    exists (
      select 1 from public.questions q
      join public.question_sets qs on qs.id = q.set_id
      where q.id = choices.question_id
        and qs.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.questions q
      join public.question_sets qs on qs.id = q.set_id
      where q.id = choices.question_id
        and qs.owner_id = auth.uid()
    )
  );

-- TODO: Khi mở cho học sinh làm bài, thêm policy SELECT cho choices thuộc câu hỏi approved.

-- 5.6. answers: kiểm tra quyền qua questions -> question_sets cha
create policy "answers_owner_all"
  on public.answers for all
  using (
    exists (
      select 1 from public.questions q
      join public.question_sets qs on qs.id = q.set_id
      where q.id = answers.question_id
        and qs.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.questions q
      join public.question_sets qs on qs.id = q.set_id
      where q.id = answers.question_id
        and qs.owner_id = auth.uid()
    )
  );

-- TODO: Lưu ý bảo mật khi mở cho học sinh: không cho phép client học sinh đọc trực tiếp đáp án trước khi nộp bài.

-- 5.7. exams: giáo viên toàn quyền với đề kiểm tra do mình sở hữu
create policy "exams_owner_all"
  on public.exams for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- TODO: Khi mở làm bài online, thêm policy SELECT cho học sinh truy cập đề thi được giao.

-- 5.8. exam_questions: kiểm tra quyền qua exams cha
create policy "exam_questions_owner_all"
  on public.exam_questions for all
  using (
    exists (
      select 1 from public.exams e
      where e.id = exam_questions.exam_id
        and e.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.exams e
      where e.id = exam_questions.exam_id
        and e.owner_id = auth.uid()
    )
  );

-- TODO: Khi mở làm bài online, thêm policy SELECT cho học sinh xem danh sách câu hỏi trong đề.

-- 5.9. exam_versions: kiểm tra quyền qua exams cha
create policy "exam_versions_owner_all"
  on public.exam_versions for all
  using (
    exists (
      select 1 from public.exams e
      where e.id = exam_versions.exam_id
        and e.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.exams e
      where e.id = exam_versions.exam_id
        and e.owner_id = auth.uid()
    )
  );

-- 5.10. attempts: giáo viên sở hữu đề hoặc bộ câu hỏi có toàn quyền trên lượt làm bài
create policy "attempts_teacher_owner_all"
  on public.attempts for all
  using (
    (
      attempts.exam_id is not null and exists (
        select 1 from public.exams e
        where e.id = attempts.exam_id
          and e.owner_id = auth.uid()
      )
    )
    or
    (
      attempts.set_id is not null and exists (
        select 1 from public.question_sets qs
        where qs.id = attempts.set_id
          and qs.owner_id = auth.uid()
      )
    )
  )
  with check (
    (
      attempts.exam_id is not null and exists (
        select 1 from public.exams e
        where e.id = attempts.exam_id
          and e.owner_id = auth.uid()
      )
    )
    or
    (
      attempts.set_id is not null and exists (
        select 1 from public.question_sets qs
        where qs.id = attempts.set_id
          and qs.owner_id = auth.uid()
      )
    )
  );

-- TODO: Khi mở tính năng học sinh làm quiz, thêm policy để học sinh tạo và xem attempts của chính mình (student_id = auth.uid()).

-- 5.11. attempt_answers: giáo viên sở hữu đề hoặc bộ câu hỏi của lượt làm bài có toàn quyền
create policy "attempt_answers_teacher_owner_all"
  on public.attempt_answers for all
  using (
    exists (
      select 1 from public.attempts a
      left join public.exams e on e.id = a.exam_id
      left join public.question_sets qs on qs.id = a.set_id
      where a.id = attempt_answers.attempt_id
        and (e.owner_id = auth.uid() or qs.owner_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.attempts a
      left join public.exams e on e.id = a.exam_id
      left join public.question_sets qs on qs.id = a.set_id
      where a.id = attempt_answers.attempt_id
        and (e.owner_id = auth.uid() or qs.owner_id = auth.uid())
    )
  );

-- TODO: Khi mở tính năng học sinh làm quiz, thêm policy để học sinh ghi và xem câu trả lời trong lượt làm bài của mình.

-- 5.12. ai_usage: người dùng chỉ được đọc dòng của chính mình; chỉ server (service_role) mới được ghi
create policy "ai_usage_select_own"
  on public.ai_usage for select
  using (user_id = auth.uid());

-- Lưu ý: Không tạo policy INSERT/UPDATE/DELETE cho authenticated/anon trên ai_usage.
-- Chỉ server dùng service_role (bỏ qua RLS) mới được phép ghi nhận lượt gọi AI.

