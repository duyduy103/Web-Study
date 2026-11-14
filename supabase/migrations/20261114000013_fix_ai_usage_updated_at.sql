-- MemoQuiz - Bản vá sửa lỗi cột updated_at trong bảng ai_usage khi gọi consume_ai_quota_v2
alter table public.ai_usage
  add column if not exists updated_at timestamptz not null default now();

