-- ============================================================================
-- MemoQuiz - Giai đoạn 1 (Bước 2): Bổ sung cột warnings và Storage bucket source-files
-- ============================================================================

-- 1. Thêm cột warnings (jsonb) vào bảng public.questions để lưu danh sách cảnh báo khi tách câu
alter table public.questions
  add column if not exists warnings jsonb not null default '[]'::jsonb;

-- 2. Tạo Supabase Storage bucket riêng tư 'source-files' (giới hạn 20MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-files',
  'source-files',
  false,
  20971520,
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'application/csv',
    'application/vnd.ms-excel'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 3. RLS Policies trên storage.objects cho bucket 'source-files'
-- Quy ước đường dẫn lưu trữ: {owner_id}/{set_id}/{filename}
-- Giáo viên chỉ được đọc/ghi/sửa/xóa các tệp nằm trong thư mục {auth.uid()} của chính mình.

drop policy if exists "source_files_bucket_select_own" on storage.objects;
create policy "source_files_bucket_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "source_files_bucket_insert_own" on storage.objects;
create policy "source_files_bucket_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "source_files_bucket_update_own" on storage.objects;
create policy "source_files_bucket_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "source_files_bucket_delete_own" on storage.objects;
create policy "source_files_bucket_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'source-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

