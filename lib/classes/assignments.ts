import { z } from "zod";
import { vi } from "@/lib/i18n/vi";
import type { ClassAssignmentKind, ExamAccessMode } from "@/lib/supabase/types";

export const createClassAssignmentSchema = z
  .object({
    kind: z.enum(["exam", "study"]),
    examId: z.string().uuid().optional().nullable(),
    setId: z.string().uuid().optional().nullable(),
    title: z
      .string()
      .trim()
      .min(1, vi.classes.assignments.errors.invalidTitle)
      .max(150, vi.classes.assignments.errors.invalidTitle),
    instructions: z.string().trim().max(1000).optional().nullable(),
    dueAt: z.string().datetime().optional().nullable(),
    lockAfterDue: z.boolean().optional().default(false),
    setExamClassOnly: z.boolean().optional().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "exam" && !val.examId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: vi.classes.assignments.errors.invalidTarget,
      });
    }
    if (val.kind === "study" && !val.setId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: vi.classes.assignments.errors.invalidTarget,
      });
    }
  });

export const updateClassAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  title: z
    .string()
    .trim()
    .min(1, vi.classes.assignments.errors.invalidTitle)
    .max(150, vi.classes.assignments.errors.invalidTitle)
    .optional(),
  instructions: z.string().trim().max(1000).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  lockAfterDue: z.boolean().optional(),
  closed: z.boolean().optional(),
});

export const deleteClassAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
});

export interface TeacherClassAssignmentItem {
  id: string;
  class_id: string;
  kind: ClassAssignmentKind;
  exam_id: string | null;
  set_id: string | null;
  title: string;
  instructions: string | null;
  due_at: string | null;
  lock_after_due: boolean;
  created_at: string;
  closed_at: string | null;
  exam_access_mode: ExamAccessMode | null;
  exam_duration_min: number | null;
  exam_max_attempts: number | null;
  exam_total_points: number | null;
  set_title: string | null;
  total_active_students: number;
  completed_count: number;
  in_progress_count: number;
}

export type StudentAssignmentStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "overdue";

export interface StudentClassAssignmentItem {
  id: string;
  class_id: string;
  class_name: string;
  teacher_name: string;
  kind: ClassAssignmentKind;
  exam_id: string | null;
  set_id: string | null;
  title: string;
  instructions: string | null;
  due_at: string | null;
  lock_after_due: boolean;
  created_at: string;
  closed_at: string | null;
  is_locked_now: boolean;
  duration_min: number | null;
  max_attempts: number | null;
  total_points: number | null;
  show_answers: boolean;
  attempts_used: number;
  active_attempt_token: string | null;
  latest_attempt_token: string | null;
  latest_attempt_status: string | null;
  latest_score: number | null;
  latest_submitted_at: string | null;
  approved_card_count: number;
  reviewed_card_count: number;
  student_status: StudentAssignmentStatus;
}

export function isAssignmentDueSoon(
  dueAt: string | null,
  status: StudentAssignmentStatus,
  now: Date = new Date()
): boolean {
  if (!dueAt || status === "submitted") return false;
  const dueMs = new Date(dueAt).getTime();
  if (!Number.isFinite(dueMs)) return false;
  const diffMs = dueMs - now.getTime();
  return diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000;
}

export function mapAssignmentRpcError(errorCode: string): {
  status: number;
  message: string;
} {
  switch (errorCode) {
    case "UNAUTHORIZED":
      return { status: 401, message: vi.classes.errors.unauthorized };
    case "TEACHER_ONLY":
      return { status: 403, message: vi.classes.errors.teacherOnly };
    case "NOT_FOUND":
      return { status: 404, message: vi.classes.errors.notFound };
    case "INVALID_TITLE":
      return { status: 400, message: vi.classes.assignments.errors.invalidTitle };
    case "INVALID_KIND":
    case "INVALID_TARGET":
      return { status: 400, message: vi.classes.assignments.errors.invalidTarget };
    case "TARGET_NOT_OWNED":
      return { status: 403, message: vi.classes.assignments.errors.targetNotOwned };
    case "NO_APPROVED_QUESTIONS":
      return {
        status: 400,
        message: vi.classes.assignments.errors.noApprovedQuestions,
      };
    case "CLASS_ACCESS_REVOKED":
      return {
        status: 403,
        message: vi.classes.assignments.errors.classAccessRevoked,
      };
    case "ASSIGNMENT_CLOSED":
      return {
        status: 400,
        message: vi.classes.assignments.errors.assignmentClosed,
      };
    case "ASSIGNMENT_LOCKED_AFTER_DUE":
      return {
        status: 400,
        message: vi.classes.assignments.errors.assignmentLockedAfterDue,
      };
    case "MAX_ATTEMPTS_REACHED":
      return {
        status: 400,
        message: vi.classes.assignments.errors.maxAttemptsReached,
      };
    case "EXAM_CLOSED":
      return { status: 400, message: vi.studentExam.closedDescription };
    case "EXAM_NOT_YET_OPEN":
      return { status: 400, message: vi.studentExam.notYetOpenTitle };
    case "EXAM_EXPIRED_WINDOW":
      return { status: 400, message: vi.studentExam.expiredWindowTitle };
    default:
      return { status: 400, message: vi.classes.errors.systemError };
  }
}

