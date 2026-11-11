# Hướng dẫn chạy Migration cho Supabase (MemoQuiz)

Tài liệu này hướng dẫn cách khởi tạo và cập nhật cơ sở dữ liệu Giai đoạn 1 từ thư mục `supabase/migrations/`.

## Danh sách các bản Migration theo thứ tự

1. `supabase/migrations/20261111000001_init_phase1.sql`: Khởi tạo 12 bảng cốt lõi Giai đoạn 1, index, trigger `on_auth_user_created` và RLS policies.
2. `supabase/migrations/20261111000002_phase1_step2_import.sql`: Bổ sung cột `warnings` (`jsonb`) cho bảng `questions` và khởi tạo Supabase Storage bucket riêng tư `source-files` (giới hạn 20MB) kèm RLS policies trên `storage.objects`.

---

## Cách 1: Dán trực tiếp vào SQL Editor trên Supabase Dashboard (Nhanh nhất)

1. Mở dự án của bạn trên [Supabase Dashboard](https://supabase.com/dashboard).
2. Ở thanh bên trái, chọn **SQL Editor** → bấm **New query**.
3. Nếu bạn đã chạy file `20261111000001_init_phase1.sql` ở Bước 1, nay chỉ cần mở tệp `supabase/migrations/20261111000002_phase1_step2_import.sql`, sao chép toàn bộ nội dung và dán vào ô soạn thảo SQL.
4. Bấm **Run** (hoặc `Ctrl + Enter`).
5. Khi thấy thông báo `Success`, cột `warnings` và bucket `source-files` đã sẵn sàng.

---

## Cách 2: Dùng Supabase CLI

```bash
# 1. Đăng nhập Supabase CLI
npx supabase login

# 2. Liên kết thư mục hiện tại với project trên Supabase (thay <project-ref> bằng Reference ID của dự án)
npx supabase link --project-ref <project-ref>

# 3. Đẩy các migration mới lên cơ sở dữ liệu
npx supabase db push
```

---

## Cách kiểm tra toàn bộ bảng đã bật RLS và Bucket `source-files`

Chạy truy vấn sau trong **SQL Editor**:

```sql
-- 1. Kiểm tra 12 bảng dữ liệu đã bật RLS
select
  tablename as ten_bang,
  rowsecurity as da_bat_rls
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'question_sets',
    'source_files',
    'questions',
    'choices',
    'answers',
    'exams',
    'exam_questions',
    'exam_versions',
    'attempts',
    'attempt_answers',
    'ai_usage'
  )
order by tablename;

-- 2. Kiểm tra bucket source-files và cột questions.warnings
select
  id,
  public as la_cong_khai,
  file_size_limit
from storage.buckets
where id = 'source-files';
```

**Kết quả mong đợi:**
- Truy vấn 1 trả về đủ **12 dòng** với `da_bat_rls = true`.
- Truy vấn 2 trả về `id = 'source-files'`, `la_cong_khai = false`, `file_size_limit = 20971520`.
