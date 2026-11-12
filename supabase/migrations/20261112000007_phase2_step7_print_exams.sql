-- ============================================================================
-- MemoQuiz - Giai đoạn 2 (Bước 7): Xuất đề in nhiều mã đề (Word .docx & PDF A4)
-- ============================================================================

-- 1. Mở rộng bảng public.profiles để lưu thông tin đầu đề mặc định của từng giáo viên
alter table public.profiles
  add column if not exists default_print_header jsonb not null default '{}'::jsonb;

-- 2. Mở rộng bảng public.exams cho đề in (exam_mode, version_count, seed, header_info)
alter table public.exams
  add column if not exists exam_mode text not null default 'online'
    check (exam_mode in ('online', 'print')),
  add column if not exists version_count integer not null default 1
    check (version_count between 1 and 8),
  add column if not exists seed text not null default '',
  add column if not exists header_info jsonb not null default '{}'::jsonb;

create index if not exists idx_exams_owner_mode_created
  on public.exams(owner_id, exam_mode, created_at desc);

