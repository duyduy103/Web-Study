# Hướng dẫn chạy Migration cho Supabase (MemoQuiz)

Tài liệu này hướng dẫn cách khởi tạo cơ sở dữ liệu Giai đoạn 1 từ tệp `supabase/migrations/20261111000001_init_phase1.sql`.

---

## Cách 1: Dán trực tiếp vào SQL Editor trên Supabase Dashboard (Nhanh nhất)

1. Mở dự án của bạn trên [Supabase Dashboard](https://supabase.com/dashboard).
2. Ở thanh bên trái, chọn **SQL Editor** → bấm **New query**.
3. Mở tệp `supabase/migrations/20261111000001_init_phase1.sql` trong dự án, sao chép toàn bộ nội dung và dán vào ô soạn thảo SQL.
4. Bấm **Run** (hoặc `Ctrl + Enter`).
5. Khi thấy thông báo `Success. No rows returned`, toàn bộ 12 bảng, index, trigger và RLS policy đã được tạo thành công.

---

## Cách 2: Dùng Supabase CLI

Nếu bạn muốn quản lý migration bằng dòng lệnh:

```bash
# 1. Đăng nhập Supabase CLI
npx supabase login

# 2. Liên kết thư mục hiện tại với project trên Supabase (thay <project-ref> bằng Reference ID của dự án)
npx supabase link --project-ref <project-ref>

# 3. Đẩy migration lên cơ sở dữ liệu
npx supabase db push
```

---

## Cách kiểm tra toàn bộ bảng đã bật RLS

Sau khi chạy migration, bạn có thể dán câu truy vấn sau vào **SQL Editor** để kiểm tra trạng thái RLS của toàn bộ 12 bảng trong schema `public`:

```sql
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
```

**Kết quả mong đợi:** Trả về đủ **12 dòng** và cột `da_bat_rls` đều có giá trị `true`.

