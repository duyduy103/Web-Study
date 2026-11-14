// Kiểu dữ liệu TypeScript cho cơ sở dữ liệu Supabase (Giai đoạn 1)
// Ghi chú: Được định nghĩa khớp chính xác với supabase/migrations/20261111000001_init_phase1.sql.
// Khi liên kết Supabase CLI, có thể cập nhật tự động bằng lệnh:
// npx supabase gen types typescript --linked > lib/supabase/types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "teacher" | "student";
export type QuestionType = "mcq" | "true_false" | "cloze" | "short_answer";
export type QuestionStatus = "draft" | "approved" | "archived";
export type AttemptStatus = "in_progress" | "submitted" | "expired";
export type ExamMode = "online" | "print" | "self";
export type FeedbackType = "bug" | "idea" | "question" | "upgrade_request" | "other";
export type FeedbackStatus = "new" | "in_progress" | "resolved" | "ignored";
export type FeedbackPriority = "low" | "medium" | "high" | "urgent";
export type PlanCode = "free" | "premium";
export type SubscriptionStatus = "active" | "canceled" | "expired";
export type OrderPeriod = "month" | "year";
export type OrderStatus = "pending" | "paid" | "expired" | "cancelled" | "refunded";
export type PaymentEventStatus = "processed" | "needs_review" | "ignored";
export type NotificationType =
  | "plan_changed"
  | "payment_confirmed"
  | "plan_expiring_soon"
  | "plan_expired"
  | "feedback_reply"
  | "system";

export interface PaymentOrder {
  id: string;
  user_id: string;
  plan_code: PlanCode | string;
  period: OrderPeriod;
  amount: number;
  currency: string;
  status: OrderStatus;
  provider: string;
  provider_ref: string | null;
  payment_code: string;
  created_at: string;
  paid_at: string | null;
  expires_at: string;
}

export interface PaymentEventItem {
  id: string;
  provider: string;
  event_id: string;
  status: PaymentEventStatus;
  reason: string | null;
  order_id: string | null;
  order_payment_code?: string | null;
  payload: Json;
  created_at: string;
}

export interface PlanLimits {
  max_sets: number;
  ai_daily: number;
  max_file_mb: number;
  max_pdf_pages: number;
  storage_mb: number;
  max_print_versions: number;
  can_export_docx: boolean;
  // Các khóa tương thích ngược từ Bước 12B
  ai_daily_limit: number;
  max_export_versions: number;
  max_questions_per_set: number | null;
  max_sets_per_day: number | null;
}

export interface PlanPrices {
  month?: number;
  year?: number;
}

export interface PlanPeriodDays {
  month?: number;
  year?: number;
}

export interface PlanCatalogItem {
  code: PlanCode;
  name: string;
  limits: PlanLimits;
  prices: PlanPrices;
  period_days: PlanPeriodDays;
  active: boolean;
}

export interface UserEntitlements {
  plan_code: PlanCode;
  plan_name: string;
  is_premium: boolean;
  status: SubscriptionStatus;
  period_end: string | null;
  source: string;
  limits: PlanLimits;
  prices?: PlanPrices;
  period_days?: PlanPeriodDays;
  custom_ai_daily_limit: number | null;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  body: string;
  metadata: Json;
  dedupe_key: string | null;
  read_at: string | null;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          display_name: string;
          default_print_header: Json;
          consented_at: string | null;
          last_seen_at: string | null;
          is_blocked: boolean;
          blocked_reason: string | null;
          blocked_at: string | null;
          custom_ai_daily_limit: number | null;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          display_name: string;
          default_print_header?: Json;
          consented_at?: string | null;
          last_seen_at?: string | null;
          is_blocked?: boolean;
          blocked_reason?: string | null;
          blocked_at?: string | null;
          custom_ai_daily_limit?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          display_name?: string;
          default_print_header?: Json;
          consented_at?: string | null;
          last_seen_at?: string | null;
          is_blocked?: boolean;
          blocked_reason?: string | null;
          blocked_at?: string | null;
          custom_ai_daily_limit?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      question_sets: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          subject: string | null;
          grade: string | null;
          source_file_hash: string | null;
          study_enabled: boolean;
          study_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          subject?: string | null;
          grade?: string | null;
          source_file_hash?: string | null;
          study_enabled?: boolean;
          study_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          subject?: string | null;
          grade?: string | null;
          source_file_hash?: string | null;
          study_enabled?: boolean;
          study_code?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_sets_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      source_files: {
        Row: {
          id: string;
          set_id: string;
          storage_path: string;
          file_hash: string;
          mime_type: string;
          page_count: number | null;
          file_size_bytes: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          set_id: string;
          storage_path: string;
          file_hash: string;
          mime_type: string;
          page_count?: number | null;
          file_size_bytes?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          set_id?: string;
          storage_path?: string;
          file_hash?: string;
          mime_type?: string;
          page_count?: number | null;
          file_size_bytes?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_files_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "question_sets";
            referencedColumns: ["id"];
          }
        ];
      };
      questions: {
        Row: {
          id: string;
          set_id: string;
          type: QuestionType;
          stem: string;
          explanation: string | null;
          source_ref: string | null;
          raw_source_text: string | null;
          topic: string | null;
          difficulty: string | null;
          confidence: number | null;
          status: QuestionStatus;
          warnings: string[];
          ai_generated: boolean;
          reviewed_by_human: boolean;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          set_id: string;
          type: QuestionType;
          stem: string;
          explanation?: string | null;
          source_ref?: string | null;
          raw_source_text?: string | null;
          topic?: string | null;
          difficulty?: string | null;
          confidence?: number | null;
          status?: QuestionStatus;
          warnings?: string[];
          ai_generated?: boolean;
          reviewed_by_human?: boolean;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          set_id?: string;
          type?: QuestionType;
          stem?: string;
          explanation?: string | null;
          source_ref?: string | null;
          raw_source_text?: string | null;
          topic?: string | null;
          difficulty?: string | null;
          confidence?: number | null;
          status?: QuestionStatus;
          warnings?: string[];
          ai_generated?: boolean;
          reviewed_by_human?: boolean;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "question_sets";
            referencedColumns: ["id"];
          }
        ];
      };
      choices: {
        Row: {
          id: string;
          question_id: string;
          text: string;
          is_correct: boolean;
          position: number;
          ai_generated: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          text: string;
          is_correct?: boolean;
          position?: number;
          ai_generated?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          question_id?: string;
          text?: string;
          is_correct?: boolean;
          position?: number;
          ai_generated?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "choices_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          }
        ];
      };
      answers: {
        Row: {
          id: string;
          question_id: string;
          answer_text: string;
          accepted_variants: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          answer_text: string;
          accepted_variants?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          question_id?: string;
          answer_text?: string;
          accepted_variants?: string[];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          }
        ];
      };
      exams: {
        Row: {
          id: string;
          owner_id: string;
          set_id: string | null;
          title: string;
          code: string | null;
          duration_min: number | null;
          shuffle_questions: boolean;
          shuffle_choices: boolean;
          is_open: boolean;
          show_answers: boolean;
          opens_at: string | null;
          closes_at: string | null;
          max_attempts: number;
          total_points: number;
          exam_mode: ExamMode;
          version_count: number;
          seed: string;
          header_info: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          set_id?: string | null;
          title: string;
          code?: string | null;
          duration_min?: number | null;
          shuffle_questions?: boolean;
          shuffle_choices?: boolean;
          is_open?: boolean;
          show_answers?: boolean;
          opens_at?: string | null;
          closes_at?: string | null;
          max_attempts?: number;
          total_points?: number;
          exam_mode?: ExamMode;
          version_count?: number;
          seed?: string;
          header_info?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          set_id?: string | null;
          title?: string;
          code?: string | null;
          duration_min?: number | null;
          shuffle_questions?: boolean;
          shuffle_choices?: boolean;
          is_open?: boolean;
          show_answers?: boolean;
          opens_at?: string | null;
          closes_at?: string | null;
          max_attempts?: number;
          total_points?: number;
          exam_mode?: ExamMode;
          version_count?: number;
          seed?: string;
          header_info?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exams_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exams_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "question_sets";
            referencedColumns: ["id"];
          }
        ];
      };
      exam_questions: {
        Row: {
          id: string;
          exam_id: string;
          question_id: string | null;
          points: number;
          position: number;
          question_snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          exam_id: string;
          question_id?: string | null;
          points?: number;
          position?: number;
          question_snapshot?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          exam_id?: string;
          question_id?: string | null;
          points?: number;
          position?: number;
          question_snapshot?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_questions_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          }
        ];
      };
      exam_versions: {
        Row: {
          id: string;
          exam_id: string;
          code: string;
          question_order: string[];
          choice_orders: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          exam_id: string;
          code: string;
          question_order?: string[];
          choice_orders?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          exam_id?: string;
          code?: string;
          question_order?: string[];
          choice_orders?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_versions_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          }
        ];
      };
      attempts: {
        Row: {
          id: string;
          exam_id: string | null;
          set_id: string | null;
          student_id: string | null;
          learner_id: string | null;
          student_name: string;
          student_class: string | null;
          attempt_token: string | null;
          started_at: string;
          submitted_at: string | null;
          deadline_at: string | null;
          status: AttemptStatus;
          score: number | null;
          needs_manual_review: boolean;
          question_order: string[];
          choice_orders: Json;
          flagged_questions: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          exam_id?: string | null;
          set_id?: string | null;
          student_id?: string | null;
          learner_id?: string | null;
          student_name?: string;
          student_class?: string | null;
          attempt_token?: string | null;
          started_at?: string;
          submitted_at?: string | null;
          deadline_at?: string | null;
          status?: AttemptStatus;
          score?: number | null;
          needs_manual_review?: boolean;
          question_order?: string[];
          choice_orders?: Json;
          flagged_questions?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          exam_id?: string | null;
          set_id?: string | null;
          student_id?: string | null;
          learner_id?: string | null;
          student_name?: string;
          student_class?: string | null;
          attempt_token?: string | null;
          started_at?: string;
          submitted_at?: string | null;
          deadline_at?: string | null;
          status?: AttemptStatus;
          score?: number | null;
          needs_manual_review?: boolean;
          question_order?: string[];
          choice_orders?: Json;
          flagged_questions?: string[];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempts_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempts_set_id_fkey";
            columns: ["set_id"];
            isOneToOne: false;
            referencedRelation: "question_sets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempts_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      attempt_answers: {
        Row: {
          id: string;
          attempt_id: string;
          exam_question_id: string | null;
          question_id: string | null;
          response: string | null;
          is_correct: boolean | null;
          points_awarded: number | null;
          needs_review: boolean;
          ai_feedback: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          attempt_id: string;
          exam_question_id?: string | null;
          question_id?: string | null;
          response?: string | null;
          is_correct?: boolean | null;
          points_awarded?: number | null;
          needs_review?: boolean;
          ai_feedback?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          attempt_id?: string;
          exam_question_id?: string | null;
          question_id?: string | null;
          response?: string | null;
          is_correct?: boolean | null;
          points_awarded?: number | null;
          needs_review?: boolean;
          ai_feedback?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          }
        ];
      };
      ai_usage: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          calls: number;
          tokens: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date?: string;
          calls?: number;
          tokens?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          date?: string;
          calls?: number;
          tokens?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      ai_cache: {
        Row: {
          id: string;
          owner_id: string;
          cache_key: string;
          task: string;
          result: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          cache_key: string;
          task: string;
          result: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          cache_key?: string;
          task?: string;
          result?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_cache_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      learners: {
        Row: {
          id: string;
          nickname: string;
          secret_hash: string;
          recovery_code_hash: string;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          nickname: string;
          secret_hash: string;
          recovery_code_hash: string;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          nickname?: string;
          secret_hash?: string;
          recovery_code_hash?: string;
          user_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_global_usage: {
        Row: {
          date: string;
          calls: number;
          tokens: number;
          updated_at: string;
        };
        Insert: {
          date?: string;
          calls?: number;
          tokens?: number;
          updated_at?: string;
        };
        Update: {
          date?: string;
          calls?: number;
          tokens?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      learner_set_enrollments: {
        Row: {
          learner_id: string;
          set_id: string;
          daily_new_limit: number;
          leech_threshold: number;
          joined_at: string;
          last_studied_at: string;
        };
        Insert: {
          learner_id: string;
          set_id: string;
          daily_new_limit?: number;
          leech_threshold?: number;
          joined_at?: string;
          last_studied_at?: string;
        };
        Update: {
          learner_id?: string;
          set_id?: string;
          daily_new_limit?: number;
          leech_threshold?: number;
          joined_at?: string;
          last_studied_at?: string;
        };
        Relationships: [];
      };
      card_states: {
        Row: {
          learner_id: string;
          question_id: string;
          due: string;
          stability: number;
          difficulty: number;
          elapsed_days: number;
          scheduled_days: number;
          learning_steps: number;
          reps: number;
          lapses: number;
          state: number;
          last_review: string | null;
          updated_at: string;
        };
        Insert: {
          learner_id: string;
          question_id: string;
          due?: string;
          stability?: number;
          difficulty?: number;
          elapsed_days?: number;
          scheduled_days?: number;
          learning_steps?: number;
          reps?: number;
          lapses?: number;
          state?: number;
          last_review?: string | null;
          updated_at?: string;
        };
        Update: {
          learner_id?: string;
          question_id?: string;
          due?: string;
          stability?: number;
          difficulty?: number;
          elapsed_days?: number;
          scheduled_days?: number;
          learning_steps?: number;
          reps?: number;
          lapses?: number;
          state?: number;
          last_review?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      review_logs: {
        Row: {
          id: string;
          learner_id: string;
          question_id: string;
          rating: number;
          state_before: number;
          elapsed_days: number;
          scheduled_days: number;
          reviewed_at: string;
        };
        Insert: {
          id?: string;
          learner_id: string;
          question_id: string;
          rating: number;
          state_before?: number;
          elapsed_days?: number;
          scheduled_days?: number;
          reviewed_at?: string;
        };
        Update: {
          id?: string;
          learner_id?: string;
          question_id?: string;
          rating?: number;
          state_before?: number;
          elapsed_days?: number;
          scheduled_days?: number;
          reviewed_at?: string;
        };
        Relationships: [];
      };
      admins: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_audit_log: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          target_type: string;
          target_id: string;
          before_state: Json | null;
          after_state: Json | null;
          reason: string | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action: string;
          target_type: string;
          target_id: string;
          before_state?: Json | null;
          after_state?: Json | null;
          reason?: string | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          action?: string;
          target_type?: string;
          target_id?: string;
          before_state?: Json | null;
          after_state?: Json | null;
          reason?: string | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          user_id: string | null;
          type: FeedbackType;
          content: string;
          contact_email: string | null;
          context_meta: Json;
          admin_notes: string | null;
          public_response: string | null;
          public_response_at: string | null;
          user_read_at: string | null;
          status: FeedbackStatus;
          priority: FeedbackPriority;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          type: FeedbackType;
          content: string;
          contact_email?: string | null;
          context_meta?: Json;
          admin_notes?: string | null;
          public_response?: string | null;
          public_response_at?: string | null;
          user_read_at?: string | null;
          status?: FeedbackStatus;
          priority?: FeedbackPriority;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          type?: FeedbackType;
          content?: string;
          contact_email?: string | null;
          context_meta?: Json;
          admin_notes?: string | null;
          public_response?: string | null;
          public_response_at?: string | null;
          user_read_at?: string | null;
          status?: FeedbackStatus;
          priority?: FeedbackPriority;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          code: string;
          name: string;
          limits: Json;
          prices: Json;
          period_days: Json;
          active: boolean;
          created_at: string;
        };
        Insert: {
          code: string;
          name: string;
          limits?: Json;
          prices?: Json;
          period_days?: Json;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          code?: string;
          name?: string;
          limits?: Json;
          prices?: Json;
          period_days?: Json;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_code: string;
          status: SubscriptionStatus;
          period_end: string | null;
          source: string;
          granted_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_code: string;
          status?: SubscriptionStatus;
          period_end?: string | null;
          source?: string;
          granted_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_code?: string;
          status?: SubscriptionStatus;
          period_end?: string | null;
          source?: string;
          granted_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          metadata: Json;
          dedupe_key: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          metadata?: Json;
          dedupe_key?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          title?: string;
          body?: string;
          metadata?: Json;
          dedupe_key?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          plan_code: string;
          period: OrderPeriod;
          amount: number;
          currency: string;
          status: OrderStatus;
          provider: string;
          provider_ref: string | null;
          payment_code: string;
          created_at: string;
          paid_at: string | null;
          expires_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_code: string;
          period: OrderPeriod;
          amount: number;
          currency?: string;
          status?: OrderStatus;
          provider?: string;
          provider_ref?: string | null;
          payment_code: string;
          created_at?: string;
          paid_at?: string | null;
          expires_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_code?: string;
          period?: OrderPeriod;
          amount?: number;
          currency?: string;
          status?: OrderStatus;
          provider?: string;
          provider_ref?: string | null;
          payment_code?: string;
          created_at?: string;
          paid_at?: string | null;
          expires_at?: string;
        };
        Relationships: [];
      };
      payment_events: {
        Row: {
          id: string;
          provider: string;
          event_id: string;
          status: PaymentEventStatus;
          reason: string | null;
          order_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider?: string;
          event_id: string;
          status: PaymentEventStatus;
          reason?: string | null;
          order_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          event_id?: string;
          status?: PaymentEventStatus;
          reason?: string | null;
          order_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_entitlements: {
        Args: {
          p_user_id?: string | null;
        };
        Returns: Json;
      };
      consume_ai_quota: {
        Args: {
          p_daily_limit?: number;
          p_tokens?: number;
        };
        Returns: Json;
      };
      record_ai_tokens: {
        Args: {
          p_tokens: number;
        };
        Returns: undefined;
      };
      save_question_inline: {
        Args: {
          p_question_id: string;
          p_expected_updated_at?: string | null;
          p_type: string;
          p_stem: string;
          p_explanation?: string | null;
          p_topic?: string | null;
          p_difficulty?: string | null;
          p_status?: string;
          p_choices?: Json;
          p_answer_text?: string | null;
        };
        Returns: Json;
      };
      restore_questions_snapshot: {
        Args: {
          p_snapshots: Json;
        };
        Returns: Json;
      };
      check_rate_limit: {
        Args: {
          p_key: string;
          p_max_hits?: number;
          p_window_seconds?: number;
        };
        Returns: boolean;
      };
      get_public_exam_by_code: {
        Args: {
          p_code: string;
        };
        Returns: Json;
      };
      start_public_exam_attempt: {
        Args: {
          p_code: string;
          p_student_name: string;
          p_student_class?: string | null;
          p_attempt_token: string;
          p_question_order: string[];
          p_choice_orders: Json;
        };
        Returns: Json;
      };
      get_student_attempt_by_token: {
        Args: {
          p_attempt_token: string;
        };
        Returns: Json;
      };
      save_student_attempt_draft: {
        Args: {
          p_attempt_token: string;
          p_responses?: Json;
          p_flagged_questions?: string[] | null;
        };
        Returns: Json;
      };
      lock_attempt_for_server_grading: {
        Args: {
          p_attempt_token: string;
          p_final_responses?: Json;
          p_flagged_questions?: string[] | null;
        };
        Returns: Json;
      };
      save_server_grading_result: {
        Args: {
          p_attempt_token: string;
          p_score: number;
          p_needs_manual_review: boolean;
          p_graded_answers: Json;
        };
        Returns: Json;
      };
      create_anonymous_learner: {
        Args: {
          p_nickname: string;
          p_secret_hash: string;
          p_recovery_code_hash: string;
        };
        Returns: Json;
      };
      recover_learner_by_code: {
        Args: {
          p_recovery_code_hash: string;
          p_new_secret_hash: string;
        };
        Returns: Json;
      };
      get_public_study_set_by_code: {
        Args: {
          p_code: string;
        };
        Returns: Json;
      };
      get_learner_study_overview: {
        Args: {
          p_secret_hash: string;
          p_code?: string | null;
        };
        Returns: Json;
      };
      update_learner_study_settings: {
        Args: {
          p_secret_hash: string;
          p_set_id: string;
          p_daily_new_limit: number;
          p_leech_threshold?: number;
        };
        Returns: Json;
      };
      reveal_study_card_hint_or_answer: {
        Args: {
          p_secret_hash: string;
          p_code: string;
          p_question_id: string;
          p_mode: string;
        };
        Returns: Json;
      };
      record_learner_card_review: {
        Args: {
          p_secret_hash: string;
          p_code: string;
          p_question_id: string;
          p_rating: number;
          p_state_before: number;
          p_elapsed_days: number;
          p_scheduled_days: number;
          p_due: string;
          p_stability: number;
          p_difficulty: number;
          p_learning_steps: number;
          p_reps: number;
          p_lapses: number;
          p_next_state: number;
          p_reviewed_at: string;
        };
        Returns: Json;
      };
      undo_learner_card_review: {
        Args: {
          p_secret_hash: string;
          p_review_log_id: string;
          p_question_id: string;
          p_previous_card_state?: Json | null;
        };
        Returns: Json;
      };
      get_teacher_set_study_stats: {
        Args: {
          p_set_id: string;
        };
        Returns: Json;
      };
      link_attempt_to_learner: {
        Args: {
          p_attempt_token: string;
          p_secret_hash: string;
        };
        Returns: undefined;
      };
      is_teacher: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      ensure_account_learner: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_account_study_summary: {
        Args: Record<string, never>;
        Returns: Json;
      };
      merge_anonymous_learner: {
        Args: {
          p_recovery_code_hash: string;
        };
        Returns: Json;
      };
      consume_ai_quota_v2: {
        Args: {
          p_user_limit?: number;
          p_global_limit?: number;
          p_tokens?: number;
        };
        Returns: Json;
      };
      delete_my_account: {
        Args: Record<string, never>;
        Returns: Json;
      };
      is_admin: {
        Args: {
          p_user_id?: string;
        };
        Returns: boolean;
      };
      get_admin_feedback_counts: {
        Args: Record<string, never>;
        Returns: {
          total: number;
          new_count: number;
          in_progress: number;
          resolved: number;
          ignored: number;
        };
      };
      update_last_seen: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      get_admin_system_overview: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_admin_users_list: {
        Args: {
          p_search?: string | null;
          p_role?: string | null;
          p_status?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: Json;
      };
      admin_manage_user: {
        Args: {
          p_target_user_id: string;
          p_action: string;
          p_reason: string;
          p_custom_limit?: number | null;
        };
        Returns: Json;
      };
      create_user_notification: {
        Args: {
          p_user_id: string;
          p_type: string;
          p_title: string;
          p_body: string;
          p_metadata?: Json;
          p_dedupe_key?: string | null;
        };
        Returns: string | null;
      };
      activate_subscription_from_order: {
        Args: {
          p_order_id: string;
          p_provider_ref?: string | null;
          p_actor_admin_id?: string | null;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      create_or_reuse_payment_order: {
        Args: {
          p_plan_code: string;
          p_period: string;
          p_payment_code: string;
        };
        Returns: Json;
      };
      get_my_order_status: {
        Args: {
          p_order_id: string;
        };
        Returns: Json;
      };
      cancel_my_pending_order: {
        Args: {
          p_order_id: string;
        };
        Returns: Json;
      };
      process_sepay_webhook_event: {
        Args: {
          p_event_id: string;
          p_transfer_type: string;
          p_transfer_amount: number;
          p_payment_code?: string | null;
          p_reference_code?: string | null;
          p_payload?: Json;
        };
        Returns: Json;
      };
      get_admin_orders_and_events: {
        Args: {
          p_status?: string | null;
          p_search?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: Json;
      };
      admin_manage_payment_order: {
        Args: {
          p_action: string;
          p_order_id?: string | null;
          p_event_id?: string | null;
          p_reason?: string | null;
          p_revoke_premium?: boolean;
        };
        Returns: Json;
      };
      admin_update_plan_config: {
        Args: {
          p_plan_code: string;
          p_prices: Json;
          p_limits: Json;
          p_period_days?: Json | null;
          p_reason?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

