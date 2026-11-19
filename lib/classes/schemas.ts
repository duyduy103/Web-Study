import { z } from "zod";
import { vi } from "@/lib/i18n/vi";
import type { ClassMemberStatus } from "@/lib/supabase/types";
import {
  normalizeJoinCode,
  STUDENT_MAX_JOINED_CLASSES,
} from "@/lib/classes/constants";

export const createClassSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, vi.classes.errors.invalidName)
    .max(120, vi.classes.errors.invalidName),
  description: z
    .string()
    .trim()
    .max(500, vi.classes.errors.invalidDescription)
    .optional()
    .nullable(),
  requireApproval: z.boolean().optional().default(false),
});

export const updateClassSettingsSchema = z.object({
  action: z
    .enum(["update", "regenerate_code", "archive", "unarchive"])
    .default("update"),
  name: z
    .string()
    .trim()
    .min(1, vi.classes.errors.invalidName)
    .max(120, vi.classes.errors.invalidName)
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, vi.classes.errors.invalidDescription)
    .optional()
    .nullable(),
  requireApproval: z.boolean().optional(),
  isOpen: z.boolean().optional(),
});

export const decideMemberSchema = z.object({
  memberUserId: z.string().uuid(),
  action: z.enum(["approve", "reject", "remove"]),
});

export const joinClassSchema = z.object({
  joinCode: z
    .string()
    .transform((v) => normalizeJoinCode(v))
    .refine((v) => v.length > 0, vi.classes.errors.invalidCode),
});

export const leaveClassSchema = z.object({
  classId: z.string().uuid(),
});

export interface TeacherClassSummary {
  id: string;
  teacher_id: string;
  name: string;
  description: string | null;
  join_code: string;
  require_approval: boolean;
  is_open: boolean;
  archived_at: string | null;
  created_at: string;
  active_student_count: number;
  pending_count: number;
  open_assignment_count: number;
}

export interface ClassMemberItem {
  id: string;
  class_id: string;
  user_id: string;
  display_name: string;
  email: string | null;
  status: ClassMemberStatus;
  joined_at: string;
  decided_at: string | null;
}

export interface StudentClassSummary {
  class_id: string;
  name: string;
  description: string | null;
  teacher_name: string;
  status: "active" | "pending";
  joined_at: string;
  decided_at: string | null;
}

export interface ClassJoinPreview {
  id: string;
  name: string;
  description: string | null;
  teacher_name: string;
  require_approval: boolean;
  is_open: boolean;
  is_full: boolean;
  is_own_class: boolean;
  my_status: ClassMemberStatus | null;
}

export function mapClassRpcError(
  errorCode: string,
  extra?: {
    currentCount?: number;
    maxClasses?: number;
    maxStudents?: number;
    isPremium?: boolean;
  }
): { status: number; message: string } {
  switch (errorCode) {
    case "UNAUTHORIZED":
      return { status: 401, message: vi.classes.errors.unauthorized };
    case "TEACHER_ONLY":
      return { status: 403, message: vi.classes.errors.teacherOnly };
    case "NOT_FOUND":
    case "MEMBER_NOT_FOUND":
      return { status: 404, message: vi.classes.errors.notFound };
    case "INVALID_NAME":
      return { status: 400, message: vi.classes.errors.invalidName };
    case "INVALID_DESCRIPTION":
      return { status: 400, message: vi.classes.errors.invalidDescription };
    case "INVALID_CODE":
      return { status: 400, message: vi.classes.errors.invalidCode };
    case "RATE_LIMITED":
      return { status: 429, message: vi.classes.errors.rateLimited };
    case "CLASS_CLOSED":
      return { status: 400, message: vi.classes.errors.classClosed };
    case "MEMBER_REJECTED":
      return { status: 403, message: vi.classes.errors.memberRejected };
    case "MEMBER_REMOVED":
      return { status: 403, message: vi.classes.errors.memberRemoved };
    case "CANNOT_JOIN_OWN_CLASS":
      return { status: 400, message: vi.classes.errors.cannotJoinOwnClass };
    case "STUDENT_MAX_CLASSES_REACHED": {
      const limit = extra?.maxClasses ?? STUDENT_MAX_JOINED_CLASSES;
      return {
        status: 400,
        message: `${vi.classes.errors.studentMaxClassesPrefix} ${limit} ${vi.classes.errors.studentMaxClassesSuffix}`,
      };
    }
    case "MAX_CLASSES_REACHED": {
      const current = extra?.currentCount ?? extra?.maxClasses ?? 1;
      const max = extra?.maxClasses ?? 1;
      const isPrem = Boolean(extra?.isPremium);
      if (isPrem) {
        return {
          status: 400,
          message: `Gói Premium cho phép tối đa ${max} lớp đang hoạt động (hiện tại ${current}/${max}). Thầy/cô có thể lưu trữ lớp cũ trước khi tạo lớp mới.`,
        };
      }
      return {
        status: 400,
        message: `Gói miễn phí được tạo tối đa ${max} lớp đang hoạt động (hiện tại ${current}/${max}). Nâng cấp gói Premium để tạo tới 10 lớp và tối đa 200 học sinh/lớp.`,
      };
    }
    case "CLASS_FULL": {
      const maxStudents = extra?.maxStudents ?? 40;
      if (extra?.isPremium === false) {
        return {
          status: 400,
          message: `Lớp học đã đạt sĩ số tối đa của gói miễn phí (${maxStudents} học sinh/lớp). Nâng cấp gói Premium để mở rộng lên 200 học sinh/lớp.`,
        };
      }
      return {
        status: 400,
        message: `Lớp học đã đạt sĩ số tối đa (${maxStudents} học sinh/lớp).`,
      };
    }
    default:
      return { status: 400, message: vi.classes.errors.systemError };
  }
}

