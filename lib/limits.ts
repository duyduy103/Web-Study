import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, UserRole } from "@/lib/supabase/types";
import { vi } from "@/lib/i18n/vi";

export interface AccountLimitsConfig {
  studentMaxSets: number;
  studentMaxFileSizeMb: number;
  teacherMaxFileSizeMb: number;
  studentMaxPdfPages: number;
  teacherMaxPdfPages: number;
  maxStorageMbPerUser: number;
}

function parsePositiveIntEnv(
  raw: string | undefined,
  fallback: number
): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getAccountLimitsConfig(): AccountLimitsConfig {
  return {
    studentMaxSets: parsePositiveIntEnv(process.env.STUDENT_MAX_SETS, 30),
    studentMaxFileSizeMb: parsePositiveIntEnv(
      process.env.STUDENT_MAX_FILE_SIZE_MB,
      10
    ),
    teacherMaxFileSizeMb: 20,
    studentMaxPdfPages: parsePositiveIntEnv(
      process.env.STUDENT_MAX_PDF_PAGES,
      30
    ),
    teacherMaxPdfPages: 60,
    maxStorageMbPerUser: parsePositiveIntEnv(
      process.env.MAX_STORAGE_MB_PER_USER,
      100
    ),
  };
}

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

export async function enforceAccountImportLimits(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  role: UserRole;
  newFileSizeBytes: number;
  pdfPageCount?: number | null;
}): Promise<void> {
  const { supabase, userId, role, newFileSizeBytes, pdfPageCount } = params;

  const { data: userSets } = await supabase
    .from("question_sets")
    .select("id")
    .eq("owner_id", userId);

  const setIds = (userSets ?? []).map((s) => s.id);
  let currentStorageBytes = 0;

  if (setIds.length > 0) {
    const { data: files } = await supabase
      .from("source_files")
      .select("file_size_bytes")
      .in("set_id", setIds);

    for (const f of files ?? []) {
      currentStorageBytes += Number(f.file_size_bytes) || 0;
    }
  }

  const check = validateImportLimitsPure({
    role,
    currentSetCount: setIds.length,
    currentStorageBytes,
    newFileSizeBytes,
    pdfPageCount,
  });

  if (!check.allowed) {
    throw new Error(check.error);
  }
}

