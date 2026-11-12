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

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          display_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          display_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          display_name?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          set_id: string;
          storage_path: string;
          file_hash: string;
          mime_type: string;
          page_count?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          set_id?: string;
          storage_path?: string;
          file_hash?: string;
          mime_type?: string;
          page_count?: number | null;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          nickname: string;
          secret_hash: string;
          recovery_code_hash: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          nickname?: string;
          secret_hash?: string;
          recovery_code_hash?: string;
          created_at?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
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
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

