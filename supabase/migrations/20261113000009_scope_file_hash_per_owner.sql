-- ============================================================================
-- MemoQuiz - Bước 10: Cô lập kiểm tra trùng file theo từng người dùng (owner_id, hash)
-- ============================================================================

-- 1. Bỏ index cũ trên source_file_hash (nếu có) và tạo composite index (owner_id, source_file_hash)
drop index if exists public.idx_question_sets_source_file_hash;
drop index if exists public.idx_question_sets_owner_source_file_hash;

create index idx_question_sets_owner_source_file_hash
  on public.question_sets (owner_id, source_file_hash)
  where source_file_hash is not null;

-- 2. Đảm bảo không có ràng buộc UNIQUE toàn cục nào trên source_file_hash hoặc file_hash
-- (Nếu trước đây từng có ràng buộc UNIQUE toàn cục do cấu hình bên ngoài, lệnh này sẽ gỡ an toàn)
do $$
declare
  r record;
begin
  for r in (
    select conname, conrelid::regclass as tablename
    from pg_constraint
    where conrelid in ('public.question_sets'::regclass, 'public.source_files'::regclass)
      and contype = 'u'
      and conname like '%hash%'
  ) loop
    execute format('alter table %s drop constraint if exists %I', r.tablename, r.conname);
  end loop;
end;
$$;

-- 3. Tạo index cho source_files theo (set_id, file_hash) để hỗ trợ tìm kiếm nhanh
drop index if exists public.idx_source_files_file_hash;
create index if not exists idx_source_files_set_file_hash
  on public.source_files (set_id, file_hash);

