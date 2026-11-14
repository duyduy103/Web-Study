import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  PlanLimits,
  UserEntitlements,
  UserRole,
} from "@/lib/supabase/types";
import {
  DEFAULT_PREMIUM_LIMITS,
  getUserEntitlements,
} from "@/lib/entitlements";
import { vi } from "@/lib/i18n/vi";

export interface AccountLimitsConfig {
  studentMaxSets: number;
  studentMaxFileSizeMb: number;
  teacherMaxFileSizeMb: number;
  studentMaxPdfPages: number;
  teacherMaxPdfPages: number;
  maxStorageMbPerUser: number;
}

export function getAccountLimitsConfig(): AccountLimitsConfig {
  return {
    studentMaxSets: 3,
    studentMaxFileSizeMb: 10,
    teacherMaxFileSizeMb: 20,
    studentMaxPdfPages: 30,
    teacherMaxPdfPages: 60,
    maxStorageMbPerUser: 50,
  };
}

/**
 * Hàm thuần kiểm tra giới hạn theo gói (`plans.limits`).
 * Trả về thông báo nêu rõ con số giới hạn của gói hiện tại và lợi ích khi nâng cấp Premium.
 */
export function validatePlanLimitsPure(params: {
  isPremium: boolean;
  planName?: string;
  limits: PlanLimits;
  currentSetCount: number;
  currentStorageBytes: number;
  newFileSizeBytes: number;
  pdfPageCount?: number | null;
  questionCount?: number | null;
  checkSetCount?: boolean;
}): { allowed: true } | { allowed: false; error: string } {
  const {
    isPremium,
    limits,
    currentSetCount,
    currentStorageBytes,
    newFileSizeBytes,
    pdfPageCount,
    questionCount,
    checkSetCount = true,
  } = params;

  const planLabel = isPremium ? "Gói Premium" : "Gói miễn phí";

  // 1. Số bộ câu hỏi đang lưu (chỉ chặn tạo mới khi đã đạt hoặc vượt max_sets; dữ liệu cũ giữ nguyên)
  if (checkSetCount && currentSetCount >= limits.max_sets) {
    const upgradeHint = isPremium
      ? "Vui lòng xóa bớt bộ câu hỏi cũ trước khi tạo bộ mới."
      : `Nâng cấp lên gói Premium để lưu tối đa ${DEFAULT_PREMIUM_LIMITS.max_sets} bộ câu hỏi, hoặc xóa bớt bộ cũ.`;
    return {
      allowed: false,
      error: `${planLabel} được lưu tối đa ${limits.max_sets} bộ câu hỏi. Bạn đã dùng ${currentSetCount}/${limits.max_sets}. ${upgradeHint}`,
    };
  }

  // 2. Kích thước tệp tải lên (max_file_mb)
  const maxFileBytes = limits.max_file_mb * 1024 * 1024;
  if (newFileSizeBytes > maxFileBytes) {
    const fileMbStr = (newFileSizeBytes / (1024 * 1024)).toFixed(1);
    const upgradeHint = isPremium
      ? "Vui lòng chia nhỏ tệp trước khi tải lên."
      : `Nâng cấp lên gói Premium để tải tệp tối đa ${DEFAULT_PREMIUM_LIMITS.max_file_mb} MB.`;
    return {
      allowed: false,
      error: `${planLabel} được tải tệp tối đa ${limits.max_file_mb} MB (tệp hiện tại ${fileMbStr} MB). ${upgradeHint}`,
    };
  }

  // 3. Số trang PDF (max_pdf_pages)
  if (typeof pdfPageCount === "number" && pdfPageCount > limits.max_pdf_pages) {
    const upgradeHint = isPremium
      ? "Vui lòng tách nhỏ tệp PDF trước khi tải lên."
      : `Nâng cấp lên gói Premium để đọc tệp PDF tối đa ${DEFAULT_PREMIUM_LIMITS.max_pdf_pages} trang.`;
    return {
      allowed: false,
      error: `${planLabel} hỗ trợ tệp PDF tối đa ${limits.max_pdf_pages} trang (tệp hiện tại ${pdfPageCount} trang). ${upgradeHint}`,
    };
  }

  // 4. Tổng dung lượng lưu trữ (storage_mb)
  const maxStorageBytes = limits.storage_mb * 1024 * 1024;
  if (currentStorageBytes + newFileSizeBytes > maxStorageBytes) {
    const usedMbStr = (currentStorageBytes / (1024 * 1024)).toFixed(1);
    const upgradeHint = isPremium
      ? "Vui lòng xóa bớt bộ câu hỏi cũ để giải phóng dung lượng."
      : `Nâng cấp lên gói Premium để mở rộng dung lượng lưu trữ lên ${DEFAULT_PREMIUM_LIMITS.storage_mb} MB.`;
    return {
      allowed: false,
      error: `${planLabel} có tổng dung lượng lưu trữ tối đa ${limits.storage_mb} MB (đã dùng ${usedMbStr}/${limits.storage_mb} MB). ${upgradeHint}`,
    };
  }

  // 5. Giới hạn số câu mỗi bộ (nếu cấu hình trong plans.limits)
  if (
    typeof questionCount === "number" &&
    limits.max_questions_per_set !== null &&
    questionCount > limits.max_questions_per_set
  ) {
    return {
      allowed: false,
      error: `${planLabel} hỗ trợ tối đa ${limits.max_questions_per_set} câu hỏi mỗi bộ (hiện có ${questionCount} câu). Nâng cấp lên gói Premium để không giới hạn số câu.`,
    };
  }

  return { allowed: true };
}

/**
 * Giữ tương thích cho unit test cũ truyền `config` trực tiếp.
 */
export function validateImportLimitsPure(params: {
  role: UserRole;
  currentSetCount: number;
  currentStorageBytes: number;
  newFileSizeBytes: number;
  pdfPageCount?: number | null;
  config?: AccountLimitsConfig;
}): { allowed: true } | { allowed: false; error: string } {
  const cfg = params.config ?? getAccountLimitsConfig();

  if (params.role === "student" && params.currentSetCount >= cfg.studentMaxSets) {
    return {
      allowed: false,
      error: `${vi.limits.maxSetsReachedPrefix} ${cfg.studentMaxSets} ${vi.limits.maxSetsReachedSuffix}`,
    };
  }

  const maxFileMb =
    params.role === "student"
      ? cfg.studentMaxFileSizeMb
      : cfg.teacherMaxFileSizeMb;
  const maxFileBytes = maxFileMb * 1024 * 1024;
  if (params.newFileSizeBytes > maxFileBytes) {
    return {
      allowed: false,
      error: `${vi.limits.fileTooLargePrefix} ${maxFileMb} ${vi.limits.fileTooLargeSuffix}`,
    };
  }

  const maxPdfPages =
    params.role === "student" ? cfg.studentMaxPdfPages : cfg.teacherMaxPdfPages;
  if (
    typeof params.pdfPageCount === "number" &&
    params.pdfPageCount > maxPdfPages
  ) {
    return {
      allowed: false,
      error: `${vi.limits.pdfTooManyPagesPrefix} ${maxPdfPages} ${vi.limits.pdfTooManyPagesSuffix}`,
    };
  }

  const maxStorageBytes = cfg.maxStorageMbPerUser * 1024 * 1024;
  if (params.currentStorageBytes + params.newFileSizeBytes > maxStorageBytes) {
    return {
      allowed: false,
      error: `${vi.limits.storageQuotaExceededPrefix} ${cfg.maxStorageMbPerUser} ${vi.limits.storageQuotaExceededSuffix}`,
    };
  }

  return { allowed: true };
}

/**
 * Kiểm tra hạn mức theo gói ở phía server (Fail-closed: nếu lỗi DB/RPC thì chặn ngay và báo "Hệ thống tạm thời gặp sự cố").
 * Giữ nguyên toàn bộ dữ liệu cũ của người dùng vượt max_sets, chỉ chặn khi tạo bộ câu hỏi mới.
 */
export async function enforceAccountImportLimits(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  role?: UserRole;
  newFileSizeBytes: number;
  pdfPageCount?: number | null;
  questionCount?: number | null;
  checkSetCount?: boolean;
}): Promise<UserEntitlements> {
  const {
    supabase,
    userId,
    newFileSizeBytes,
    pdfPageCount,
    questionCount,
    checkSetCount = true,
  } = params;

  let entitlements: UserEntitlements;
  try {
    entitlements = await getUserEntitlements(supabase, userId, {
      strict: true,
    });
  } catch {
    throw new Error(vi.limits.systemErrorFailClosed);
  }

  const { data: userSets, error: setsError } = await supabase
    .from("question_sets")
    .select("id")
    .eq("owner_id", userId);

  if (setsError) {
    throw new Error(vi.limits.systemErrorFailClosed);
  }

  const setIds = (userSets ?? []).map((s) => s.id);
  let currentStorageBytes = 0;

  if (setIds.length > 0) {
    const { data: files, error: filesError } = await supabase
      .from("source_files")
      .select("file_size_bytes")
      .in("set_id", setIds);

    if (filesError) {
      throw new Error(vi.limits.systemErrorFailClosed);
    }

    for (const f of files ?? []) {
      currentStorageBytes += Number(f.file_size_bytes) || 0;
    }
  }

  const check = validatePlanLimitsPure({
    isPremium: entitlements.is_premium,
    planName: entitlements.plan_name,
    limits: entitlements.limits,
    currentSetCount: setIds.length,
    currentStorageBytes,
    newFileSizeBytes,
    pdfPageCount,
    questionCount,
    checkSetCount,
  });

  if (!check.allowed) {
    throw new Error(check.error);
  }

  return entitlements;
}
