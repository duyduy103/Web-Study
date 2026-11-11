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
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          subject?: string | null;
          grade?: string | null;
          source_file_hash?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          subject?: string | null;
          grade?: string | null;
          source_file_hash?: string | null;
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
          topic: string | null;
          difficulty: string | null;
          confidence: number | null;
          status: QuestionStatus;
          warnings: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          set_id: string;
          type: QuestionType;
          stem: string;
          explanation?: string | null;
          source_ref?: string | null;
          topic?: string | null;
          difficulty?: string | null;
          confidence?: number | null;
          status?: QuestionStatus;
          warnings?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          set_id?: string;
          type?: QuestionType;
          stem?: string;
          explanation?: string | null;
          source_ref?: string | null;
          topic?: string | null;
          difficulty?: string | null;
          confidence?: number | null;
          status?: QuestionStatus;
          warnings?: string[];
          created_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          text: string;
          is_correct?: boolean;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          question_id?: string;
          text?: string;
          is_correct?: boolean;
          position?: number;
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
          duration_min: number | null;
          shuffle_questions: boolean;
          shuffle_choices: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          set_id?: string | null;
          title: string;
          duration_min?: number | null;
          shuffle_questions?: boolean;
          shuffle_choices?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          set_id?: string | null;
          title?: string;
          duration_min?: number | null;
          shuffle_questions?: boolean;
          shuffle_choices?: boolean;
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
          question_id: string;
          points: number;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          exam_id: string;
          question_id: string;
          points?: number;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          exam_id?: string;
          question_id?: string;
          points?: number;
          position?: number;
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
          started_at: string;
          submitted_at: string | null;
          score: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          exam_id?: string | null;
          set_id?: string | null;
          student_id?: string | null;
          started_at?: string;
          submitted_at?: string | null;
          score?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          exam_id?: string | null;
          set_id?: string | null;
          student_id?: string | null;
          started_at?: string;
          submitted_at?: string | null;
          score?: number | null;
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
          question_id: string;
          response: string | null;
          is_correct: boolean | null;
          ai_feedback: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          attempt_id: string;
          question_id: string;
          response?: string | null;
          is_correct?: boolean | null;
          ai_feedback?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          attempt_id?: string;
          question_id?: string;
          response?: string | null;
          is_correct?: boolean | null;
          ai_feedback?: string | null;
          created_at?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

