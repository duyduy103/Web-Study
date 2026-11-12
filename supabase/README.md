# Hướng dẫn chạy Migration cho Supabase (MemoQuiz)

Tài liệu này hướng dẫn cách khởi tạo và cập nhật cơ sở dữ liệu Giai đoạn 1 từ thư mục `supabase/migrations/`.

## Danh sách các bản Migration theo thứ tự

1. `supabase/migrations/20261111000001_init_phase1.sql`: Khởi tạo 12 bảng cốt lõi Giai đoạn 1, index, trigger `on_auth_user_created` và RLS policies.
2. `supabase/migrations/20261111000002_phase1_step2_import.sql`: Bổ sung cột `warnings` (`jsonb`) cho bảng `questions` và khởi tạo Supabase Storage bucket riêng tư `source-files` (giới hạn 20MB) kèm RLS policies trên `storage.objects`.
3. `supabase/migrations/20261112000003_phase1_step3_ai.sql`: Bổ sung cột `ai_generated` cho `questions` và `choices`, tạo bảng `ai_cache` kèm RLS, tạo hàm RPC nguyên tử `consume_ai_quota` & `record_ai_tokens`, và mở rộng bucket `source-files` nhận thêm `.pdf`, `.png`, `.jpg/.jpeg`.
4. `supabase/migrations/20261112000004_phase1_step4_review.sql`: Bổ sung cột `updated_at`, `reviewed_by_human`, `reviewed_at`, `raw_source_text` cho bảng `questions`, trigger tự động cập nhật `updated_at`, và 2 hàm RPC nguyên tử `save_question_inline` (sửa câu + kiểm tra xung đột) và `restore_questions_snapshot` (hoàn tác / làm lại).
5. `supabase/migrations/20261112000005_phase1_step5_exams.sql`: Mở rộng `exams` (`code`, `is_open`, `show_answers`, `opens_at`, `closes_at`, `max_attempts`, `total_points`), `exam_questions` (`question_snapshot jsonb`, FK `ON DELETE SET NULL`), `attempts` (`student_name`, `student_class`, `attempt_token`, `deadline_at`, `status`, `needs_manual_review`, `question_order`, `choice_orders`, `flagged_questions`), `attempt_answers` (`exam_question_id`, `points_awarded`, `needs_review`), bảng `rate_limits` kèm RLS và các hàm RPC bảo mật cho học sinh làm bài qua `/t/[code]`.
6. `supabase/migrations/20261112000006_phase2_step6_study.sql`: Mở rộng `question_sets` (`study_enabled`, `study_code`), `attempts` (`learner_id`), tạo bảng `learners`, `learner_set_enrollments`, `card_states`, `review_logs` kèm RLS và 9 hàm RPC `SECURITY DEFINER` cho chế độ ôn tập khoa học (Active Recall & FSRS) tại `/study/[code]`.

---

## Cách 1: Dán trực tiếp vào SQL Editor trên Supabase Dashboard (Nhanh nhất)

1. Mở dự án của bạn trên [Supabase Dashboard](https://supabase.com/dashboard).
2. Ở thanh bên trái, chọn **SQL Editor** → bấm **New query**.
3. Mở tệp migration mới nhất `supabase/migrations/20261112000006_phase2_step6_study.sql`, sao chép toàn bộ nội dung và dán vào ô soạn thảo SQL.
4. Bấm **Run** (hoặc `Ctrl + Enter`).
5. Khi thấy thông báo `Success`, các bảng và hàm RPC cho Chế độ ôn tập khoa học (Bước 6) đã sẵn sàng.

---

## Cách 2: Dùng Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

---

## Cách kiểm tra toàn bộ 13 bảng đã bật RLS

Chạy truy vấn sau trong **SQL Editor**:

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
    'ai_usage',
    'ai_cache'
  )
order by tablename;
```

**Kết quả mong đợi:** Trả về đủ **13 dòng** với `da_bat_rls = true`.
