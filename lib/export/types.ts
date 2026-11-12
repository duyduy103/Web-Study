import type {
  ExamQuestionSnapshot,
  ExamQuestionWithSnapshot,
} from "@/lib/grading/types";
import type { QuestionType } from "@/lib/supabase/types";

export interface PrintExamHeaderInfo {
  schoolName?: string | null;
  examName: string;
  subject?: string | null;
  className?: string | null;
  durationMinutes?: number | null;
  studentInfoLine?: string | null;
}

export interface PrintQuestionChoiceItem {
  choiceId: string;
  label: string; // "A" | "B" | "C" | "D"...
  text: string;
  isCorrect: boolean;
}

export interface PrintVersionQuestionItem {
  examQuestionId: string;
  originalNumber: number; // Số thứ tự câu gốc (1..N)
  displayNumber: number; // Số thứ tự sau khi trộn trong mã đề này (1..N)
  points: number;
  type: QuestionType;
  stem: string;
  displayStem: string; // Với cloze thì đã thay [blank]/___ thành ______
  choices: PrintQuestionChoiceItem[];
  correctAnswerDisplay: string; // VD: "B", "A (Đúng)", hoặc đáp án điền khuyết / tự luận
  answerText: string | null;
  acceptedVariants: string[];
  explanation: string | null;
  shortAnswerLines: number;
}

export interface BuiltPrintExamVersion {
  versionCode: string; // "101", "102", ... "108"
  questionOrder: string[];
  choiceOrders: Record<string, string[]>;
  questions: PrintVersionQuestionItem[];
  quickAnswerSummary: string; // VD: "1-B  2-D  3-A ..."
}

export interface CrossReferenceVersionCell {
  versionCode: string;
  displayNumber: number;
  correctAnswerDisplay: string;
}

export interface CrossReferenceRow {
  examQuestionId: string;
  originalNumber: number;
  type: QuestionType;
  stemPreview: string;
  byVersion: Record<string, CrossReferenceVersionCell>;
}

export interface BuiltPrintExamPackage {
  header: PrintExamHeaderInfo;
  seed: string;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  totalPoints: number;
  originalQuestions: ExamQuestionWithSnapshot[];
  versions: BuiltPrintExamVersion[];
  crossReference: CrossReferenceRow[];
}

export type { ExamQuestionSnapshot, ExamQuestionWithSnapshot };

