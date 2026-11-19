-- ============================================================================
-- BƯỚC 14 — GIAI ĐOẠN 3: KẾT QUẢ LỚP HỌC CHO GIÁO VIÊN & THỐNG KÊ ADMIN
-- Migration: 20261119000020_step14_phase3_results_and_admin_stats.sql
-- ============================================================================

-- 1. HÀM RPC BẢNG ĐIỂM & THỐNG KÊ KẾT QUẢ LỚP HỌC CHO GIÁO VIÊN CHỦ LỚP
-- Chỉ giáo viên sở hữu lớp mới được đọc. Admin, giáo viên khác, học sinh đều bị từ chối.
create or replace function public.get_teacher_class_results(
  p_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_class public.classes%rowtype;
  v_students jsonb := '[]'::jsonb;
  v_assignments jsonb := '[]'::jsonb;
  v_exam_cells jsonb := '[]'::jsonb;
  v_study_cells jsonb := '[]'::jsonb;
  v_exam_details jsonb := '{}'::jsonb;
  v_study_details jsonb := '{}'::jsonb;
begin
  if v_user_id is null or not public.is_teacher() then
    return jsonb_build_object('error', 'TEACHER_ROLE_REQUIRED');
  end if;

  select * into v_class
  from public.classes
  where id = p_class_id
    and teacher_id = v_user_id;

  if not found then
    return jsonb_build_object('error', 'CLASS_NOT_FOUND');
  end if;

  -- 1.1. Danh sách học sinh đang hoạt động trong lớp
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', cm.user_id,
        'display_name', coalesce(nullif(btrim(p.display_name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Học sinh'),
        'email', coalesce(u.email, ''),
        'status', cm.status,
        'joined_at', cm.joined_at
      )
      order by coalesce(nullif(btrim(p.display_name), ''), split_part(coalesce(u.email, ''), '@', 1), 'Học sinh') asc
    ),
    '[]'::jsonb
  )
  into v_students
  from public.class_members cm
  left join public.profiles p on p.id = cm.user_id
  left join auth.users u on u.id = cm.user_id
  where cm.class_id = p_class_id
    and cm.status = 'active';

  -- 1.2. Danh sách bài giao trong lớp
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ca.id,
        'kind', ca.kind,
        'exam_id', ca.exam_id,
        'set_id', ca.set_id,
        'title', ca.title,
        'due_at', ca.due_at,
        'lock_after_due', ca.lock_after_due,
        'is_open', ca.is_open,
        'created_at', ca.created_at,
        'exam_total_points', coalesce(
          (select sum(eq.points)::numeric from public.exam_questions eq where eq.exam_id = ca.exam_id),
          0
        ),
        'set_approved_cards', coalesce(
          (select count(*)::integer from public.questions q where q.set_id = ca.set_id and q.status = 'approved'),
          0
        )
      )
      order by ca.created_at desc
    ),
    '[]'::jsonb
  )
  into v_assignments
  from public.class_assignments ca
  where ca.class_id = p_class_id;

  -- 1.3. Ô bảng điểm cho bài kiểm tra (Học sinh × Bài kiểm tra)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'assignment_id', ca.id,
        'exam_id', ca.exam_id,
        'student_id', cm.user_id,
        'attempts_count', coalesce(att_agg.attempts_count, 0),
        'submitted_count', coalesce(att_agg.submitted_count, 0),
        'status', case
          when coalesce(att_agg.submitted_count, 0) > 0 then coalesce(att_agg.latest_done_status, 'submitted')
          when coalesce(att_agg.attempts_count, 0) > 0 then 'in_progress'
          else 'not_submitted'
        end,
        'is_late', case
          when ca.due_at is not null
               and att_agg.latest_submitted_at is not null
               and att_agg.latest_submitted_at > ca.due_at then true
          when ca.due_at is not null
               and coalesce(att_agg.submitted_count, 0) = 0
               and now() > ca.due_at then true
          else false
        end,
        'score', att_agg.latest_score,
        'total_points', coalesce(
          (select sum(eq.points)::numeric from public.exam_questions eq where eq.exam_id = ca.exam_id),
          0
        ),
        'needs_manual_review', coalesce(att_agg.latest_needs_review, false),
        'duration_seconds', att_agg.latest_duration_sec,
        'started_at', att_agg.latest_started_at,
        'submitted_at', att_agg.latest_submitted_at,
        'latest_attempt_id', att_agg.latest_attempt_id
      )
    ),
    '[]'::jsonb
  )
  into v_exam_cells
  from public.class_assignments ca
  cross join public.class_members cm
  left join lateral (
    select
      count(*)::integer as attempts_count,
      count(*) filter (where a.status in ('submitted', 'expired'))::integer as submitted_count,
      (
        select a2.id
        from public.attempts a2
        where a2.exam_id = ca.exam_id
          and a2.student_id = cm.user_id
          and (a2.assignment_id = ca.id or a2.assignment_id is null)
        order by (a2.status in ('submitted', 'expired')) desc, coalesce(a2.submitted_at, a2.started_at) desc
        limit 1
      ) as latest_attempt_id,
      (
        select a2.status
        from public.attempts a2
        where a2.exam_id = ca.exam_id
          and a2.student_id = cm.user_id
          and (a2.assignment_id = ca.id or a2.assignment_id is null)
          and a2.status in ('submitted', 'expired')
        order by coalesce(a2.submitted_at, a2.started_at) desc
        limit 1
      ) as latest_done_status,
      (
        select a2.score
        from public.attempts a2
        where a2.exam_id = ca.exam_id
          and a2.student_id = cm.user_id
          and (a2.assignment_id = ca.id or a2.assignment_id is null)
          and a2.status in ('submitted', 'expired')
        order by coalesce(a2.submitted_at, a2.started_at) desc
        limit 1
      ) as latest_score,
      (
        select a2.needs_manual_review
        from public.attempts a2
        where a2.exam_id = ca.exam_id
          and a2.student_id = cm.user_id
          and (a2.assignment_id = ca.id or a2.assignment_id is null)
          and a2.status in ('submitted', 'expired')
        order by coalesce(a2.submitted_at, a2.started_at) desc
        limit 1
      ) as latest_needs_review,
      (
        select a2.started_at
        from public.attempts a2
        where a2.exam_id = ca.exam_id
          and a2.student_id = cm.user_id
          and (a2.assignment_id = ca.id or a2.assignment_id is null)
        order by (a2.status in ('submitted', 'expired')) desc, coalesce(a2.submitted_at, a2.started_at) desc
        limit 1
      ) as latest_started_at,
      (
        select a2.submitted_at
        from public.attempts a2
        where a2.exam_id = ca.exam_id
          and a2.student_id = cm.user_id
          and (a2.assignment_id = ca.id or a2.assignment_id is null)
          and a2.status in ('submitted', 'expired')
        order by coalesce(a2.submitted_at, a2.started_at) desc
        limit 1
      ) as latest_submitted_at,
      (
        select greatest(0, extract(epoch from (a2.submitted_at - a2.started_at))::integer)
        from public.attempts a2
        where a2.exam_id = ca.exam_id
          and a2.student_id = cm.user_id
          and (a2.assignment_id = ca.id or a2.assignment_id is null)
          and a2.status in ('submitted', 'expired')
          and a2.submitted_at is not null
        order by a2.submitted_at desc
        limit 1
      ) as latest_duration_sec
    from public.attempts a
    where a.exam_id = ca.exam_id
      and a.student_id = cm.user_id
      and (a.assignment_id = ca.id or a.assignment_id is null)
  ) att_agg on true
  where ca.class_id = p_class_id
    and ca.kind = 'exam'
    and cm.class_id = p_class_id
    and cm.status = 'active';

  -- 1.4. Ô tiến độ ôn tập FSRS (Học sinh × Bộ ôn tập)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'assignment_id', ca.id,
        'set_id', ca.set_id,
        'student_id', cm.user_id,
        'total_cards', coalesce(
          (select count(*)::integer from public.questions q where q.set_id = ca.set_id and q.status = 'approved'),
          0
        ),
        'cards_reviewed', coalesce(st_agg.cards_reviewed, 0),
        'total_reviews', coalesce(st_agg.total_reviews, 0),
        'retention_rate', coalesce(st_agg.retention_rate, 0),
        'leech_count', coalesce(st_agg.leech_count, 0),
        'last_studied_at', st_agg.last_studied_at,
        'status', case
          when coalesce(st_agg.cards_reviewed, 0) > 0 then 'submitted'
          else 'not_submitted'
        end
      )
    ),
    '[]'::jsonb
  )
  into v_study_cells
  from public.class_assignments ca
  cross join public.class_members cm
  left join lateral (
    select
      (
        select count(distinct cs.question_id)::integer
        from public.card_states cs
        join public.learners l on l.id = cs.learner_id
        join public.questions q on q.id = cs.question_id
        where l.user_id = cm.user_id
          and q.set_id = ca.set_id
          and q.status = 'approved'
      ) as cards_reviewed,
      (
        select count(distinct cs.question_id)::integer
        from public.card_states cs
        join public.learners l on l.id = cs.learner_id
        join public.questions q on q.id = cs.question_id
        where l.user_id = cm.user_id
          and q.set_id = ca.set_id
          and q.status = 'approved'
          and cs.lapses >= 3
      ) as leech_count,
      (
        select count(*)::integer
        from public.review_logs rl
        join public.learners l on l.id = rl.learner_id
        join public.questions q on q.id = rl.question_id
        where l.user_id = cm.user_id
          and q.set_id = ca.set_id
          and q.status = 'approved'
      ) as total_reviews,
      (
        select case
          when count(*) > 0 then round((count(*) filter (where rl.rating in (2, 3, 4))::numeric / count(*)::numeric) * 100, 1)
          else 0
        end
        from public.review_logs rl
        join public.learners l on l.id = rl.learner_id
        join public.questions q on q.id = rl.question_id
        where l.user_id = cm.user_id
          and q.set_id = ca.set_id
          and q.status = 'approved'
      ) as retention_rate,
      (
        select max(cs.last_review)
        from public.card_states cs
        join public.learners l on l.id = cs.learner_id
        join public.questions q on q.id = cs.question_id
        where l.user_id = cm.user_id
          and q.set_id = ca.set_id
          and q.status = 'approved'
      ) as last_studied_at
  ) st_agg on true
  where ca.class_id = p_class_id
    and ca.kind = 'study'
    and cm.class_id = p_class_id
    and cm.status = 'active';

  -- 1.5. Chi tiết câu hỏi & bài nộp từng bài kiểm tra trong lớp (để tái dùng thống kê & chấm tự luận Bước 5)
  select coalesce(
    jsonb_object_agg(
      ca.id::text,
      jsonb_build_object(
        'exam_id', ca.exam_id,
        'total_points', coalesce(
          (select sum(eq.points)::numeric from public.exam_questions eq where eq.exam_id = ca.exam_id),
          0
        ),
        'questions', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'examQuestionId', eq.id,
                'questionId', eq.question_id,
                'points', eq.points,
                'position', eq.position,
                'snapshot', eq.question_snapshot
              )
              order by eq.position asc
            )
            from public.exam_questions eq
            where eq.exam_id = ca.exam_id
          ),
          '[]'::jsonb
        ),
        'attempts', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'studentId', a.student_id,
                'studentName', coalesce(nullif(btrim(p.display_name), ''), split_part(coalesce(u.email, ''), '@', 1), a.student_name),
                'studentClass', v_class.name,
                'startedAt', a.started_at,
                'submittedAt', a.submitted_at,
                'status', a.status,
                'score', a.score,
                'needsManualReview', a.needs_manual_review,
                'answers', coalesce(
                  (
                    select jsonb_agg(
                      jsonb_build_object(
                        'examQuestionId', aa.exam_question_id,
                        'questionId', aa.question_id,
                        'response', aa.response,
                        'isCorrect', aa.is_correct,
                        'pointsAwarded', aa.points_awarded,
                        'needsReview', aa.needs_review
                      )
                    )
                    from public.attempt_answers aa
                    where aa.attempt_id = a.id
                  ),
                  '[]'::jsonb
                )
              )
              order by coalesce(a.submitted_at, a.started_at) desc
            )
            from public.attempts a
            join public.class_members cm2 on cm2.class_id = p_class_id and cm2.user_id = a.student_id and cm2.status = 'active'
            left join public.profiles p on p.id = a.student_id
            left join auth.users u on u.id = a.student_id
            where a.exam_id = ca.exam_id
              and (a.assignment_id = ca.id or a.assignment_id is null)
          ),
          '[]'::jsonb
        )
      )
    ),
    '{}'::jsonb
  )
  into v_exam_details
  from public.class_assignments ca
  where ca.class_id = p_class_id
    and ca.kind = 'exam';

  -- 1.6. Chi tiết câu hay quên theo từng bài ôn tập trong lớp (chỉ tính trên học sinh của lớp này)
  select coalesce(
    jsonb_object_agg(
      ca.id::text,
      jsonb_build_object(
        'set_id', ca.set_id,
        'questions', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'question_id', q.id,
                'stem', q.stem,
                'topic', q.topic,
                'type', q.type,
                'total_lapses', coalesce(cs_cls.total_lapses, 0),
                'leech_learners_count', coalesce(cs_cls.leech_learners_count, 0),
                'again_reviews_count', coalesce(rl_cls.again_count, 0),
                'total_reviews_count', coalesce(rl_cls.total_count, 0)
              )
              order by coalesce(cs_cls.total_lapses, 0) desc, coalesce(rl_cls.again_count, 0) desc
            )
            from public.questions q
            left join lateral (
              select
                sum(cs.lapses)::integer as total_lapses,
                count(*) filter (where cs.lapses >= 3)::integer as leech_learners_count
              from public.card_states cs
              join public.learners l on l.id = cs.learner_id
              join public.class_members cm3 on cm3.class_id = p_class_id and cm3.user_id = l.user_id and cm3.status = 'active'
              where cs.question_id = q.id
            ) cs_cls on true
            left join lateral (
              select
                count(*) filter (where rl.rating = 1)::integer as again_count,
                count(*)::integer as total_count
              from public.review_logs rl
              join public.learners l on l.id = rl.learner_id
              join public.class_members cm4 on cm4.class_id = p_class_id and cm4.user_id = l.user_id and cm4.status = 'active'
              where rl.question_id = q.id
            ) rl_cls on true
            where q.set_id = ca.set_id
              and q.status = 'approved'
          ),
          '[]'::jsonb
        )
      )
    ),
    '{}'::jsonb
  )
  into v_study_details
  from public.class_assignments ca
  where ca.class_id = p_class_id
    and ca.kind = 'study';

  return jsonb_build_object(
    'error', null,
    'class_id', v_class.id,
    'class_name', v_class.name,
    'students', v_students,
    'assignments', v_assignments,
    'exam_cells', v_exam_cells,
    'study_cells', v_study_cells,
    'exam_details', v_exam_details,
    'study_details', v_study_details
  );
end;
$$;

grant execute on function public.get_teacher_class_results(uuid) to authenticated;

-- 2. CẬP NHẬT get_admin_system_overview BỔ SUNG CHỈ SỐ TỔNG HỢP LỚP HỌC (KHÔNG ĐỌC NỘI DUNG/KẾT QUẢ LỚP)
create or replace function public.get_admin_system_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vn_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_vn_month_start timestamptz := (date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh');
  v_total_users integer := 0;
  v_new_today integer := 0;
  v_new_7d integer := 0;
  v_new_30d integer := 0;
  v_teacher_count integer := 0;
  v_student_count integer := 0;
  v_dau integer := 0;
  v_wau integer := 0;
  v_mau integer := 0;
  v_question_sets integer := 0;
  v_questions integer := 0;
  v_exams integer := 0;
  v_attempts integer := 0;
  v_review_logs integer := 0;
  v_anonymous_learners integer := 0;
  v_classes_count integer := 0;
  v_class_members_count integer := 0;
  v_class_assignments_count integer := 0;
  v_ai_today_calls integer := 0;
  v_ai_total_tokens bigint := 0;
  v_storage_bytes bigint := 0;
  v_monthly_revenue_vnd bigint := 0;
  v_pending_orders integer := 0;
  v_active_premium_users integer := 0;
  v_expiring_soon_users integer := 0;
  v_needs_review_events integer := 0;
  v_signups_30d jsonb := '[]'::jsonb;
  v_activity_30d jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Admin role required' using errcode = '42501';
  end if;

  -- Tự động hết hạn đơn quá 48 giờ
  update public.orders
  set status = 'expired'
  where status = 'pending'
    and expires_at <= now();

  -- 1. Người dùng & vai trò
  select count(*) into v_total_users from public.profiles;
  select count(*) into v_new_today from public.profiles where (created_at at time zone 'Asia/Ho_Chi_Minh')::date = v_vn_today;
  select count(*) into v_new_7d from public.profiles where created_at >= now() - interval '7 days';
  select count(*) into v_new_30d from public.profiles where created_at >= now() - interval '30 days';
  select count(*) into v_teacher_count from public.profiles where role = 'teacher';
  select count(*) into v_student_count from public.profiles where role = 'student';

  -- 2. Hoạt động DAU/WAU/MAU
  select count(*) into v_dau from public.profiles where last_seen_at >= now() - interval '1 day';
  select count(*) into v_wau from public.profiles where last_seen_at >= now() - interval '7 days';
  select count(*) into v_mau from public.profiles where last_seen_at >= now() - interval '30 days';

  -- 3. Số liệu nội dung, học tập & tổng hợp lớp học (chỉ đếm số lượng, không đọc nội dung/điểm)
  select count(*) into v_question_sets from public.question_sets;
  select count(*) into v_questions from public.questions;
  select count(*) into v_exams from public.exams;
  select count(*) into v_attempts from public.attempts;
  select count(*) into v_review_logs from public.review_logs;
  select count(*) into v_anonymous_learners from public.learners where user_id is null;
  select count(*) into v_classes_count from public.classes;
  select count(*) into v_class_members_count from public.class_members where status = 'active';
  select count(*) into v_class_assignments_count from public.class_assignments;

  -- 4. AI usage (theo ngày Việt Nam)
  select coalesce(calls, 0) into v_ai_today_calls from public.ai_global_usage where date = v_vn_today;
  select coalesce(sum(tokens), 0) into v_ai_total_tokens from public.ai_global_usage;

  -- 5. Dung lượng Storage ước tính
  select coalesce(count(*) * 256000, 0) into v_storage_bytes from public.source_files;

  -- 6. Số liệu thanh toán & gói Premium
  select coalesce(sum(amount), 0) into v_monthly_revenue_vnd
  from public.orders
  where status = 'paid'
    and paid_at >= v_vn_month_start;

  select count(*) into v_pending_orders
  from public.orders
  where status = 'pending'
    and expires_at > now();

  select count(distinct user_id) into v_active_premium_users
  from public.subscriptions
  where plan_code = 'premium'
    and status = 'active'
    and (period_end is null or period_end > now());

  select count(distinct user_id) into v_expiring_soon_users
  from public.subscriptions
  where plan_code = 'premium'
    and status = 'active'
    and period_end is not null
    and period_end > now()
    and period_end <= now() + interval '7 days';

  select count(*) into v_needs_review_events
  from public.payment_events
  where status = 'needs_review';

  -- 7. Chuỗi 30 ngày đăng ký mới
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'label', to_char(d.day, 'DD/MM'),
      'count', coalesce(t.cnt, 0)
    ) order by d.day
  ), '[]'::jsonb) into v_signups_30d
  from generate_series(v_vn_today - interval '29 days', v_vn_today, interval '1 day') as d(day)
  left join (
    select (created_at at time zone 'Asia/Ho_Chi_Minh')::date as day, count(*) as cnt
    from public.profiles
    where created_at >= (v_vn_today - interval '29 days')
    group by 1
  ) t on t.day = d.day::date;

  -- 8. Chuỗi 30 ngày lượt ôn FSRS
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'label', to_char(d.day, 'DD/MM'),
      'count', coalesce(r.cnt, 0)
    ) order by d.day
  ), '[]'::jsonb) into v_activity_30d
  from generate_series(v_vn_today - interval '29 days', v_vn_today, interval '1 day') as d(day)
  left join (
    select (reviewed_at at time zone 'Asia/Ho_Chi_Minh')::date as day, count(*) as cnt
    from public.review_logs
    where reviewed_at >= (v_vn_today - interval '29 days')
    group by 1
  ) r on r.day = d.day::date;

  return jsonb_build_object(
    'users', jsonb_build_object(
      'total', v_total_users,
      'new_today', v_new_today,
      'new_7d', v_new_7d,
      'new_30d', v_new_30d,
      'teachers', v_teacher_count,
      'students', v_student_count,
      'dau', v_dau,
      'wau', v_wau,
      'mau', v_mau
    ),
    'content', jsonb_build_object(
      'question_sets', v_question_sets,
      'questions', v_questions,
      'exams', v_exams,
      'attempts', v_attempts,
      'review_logs', v_review_logs,
      'anonymous_learners', v_anonymous_learners,
      'classes', v_classes_count,
      'class_members', v_class_members_count,
      'class_assignments', v_class_assignments_count
    ),
    'ai', jsonb_build_object(
      'today_calls', v_ai_today_calls,
      'total_tokens', v_ai_total_tokens
    ),
    'storage', jsonb_build_object(
      'estimated_bytes', v_storage_bytes
    ),
    'billing', jsonb_build_object(
      'monthly_revenue_vnd', v_monthly_revenue_vnd,
      'pending_orders', v_pending_orders,
      'active_premium_users', v_active_premium_users,
      'expiring_soon_users', v_expiring_soon_users,
      'needs_review_events', v_needs_review_events
    ),
    'charts', jsonb_build_object(
      'signups_30d', v_signups_30d,
      'reviews_30d', v_activity_30d
    )
  );
end;
$$;

grant execute on function public.get_admin_system_overview() to authenticated;

