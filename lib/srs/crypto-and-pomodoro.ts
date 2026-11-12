import crypto from "node:crypto";
import { JOIN_CODE_ALPHABET } from "@/lib/grading";
import { getVietnamHour } from "@/lib/srs";

/**
 * Băm SHA-256 cho khóa bí mật hoặc mã khôi phục (chỉ lưu mã băm vào DB)
 */
export function hashLearnerTokenSha256(rawToken: string): string {
  return crypto
    .createHash("sha256")
    .update(rawToken.trim())
    .digest("hex");
}

/**
 * Chuẩn hóa mã khôi phục do học sinh nhập (bỏ khoảng trắng, dấu gạch ngang, đổi sang chữ hoa)
 */
export function normalizeRecoveryCode(rawInput: string): string {
  return rawInput.replace(/[\s\-_]+/g, "").toUpperCase();
}

/**
 * Sinh khóa bí mật 48 ký tự hex lưu trong localStorage của học sinh
 */
export function generateLearnerSecret(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Sinh mã khôi phục 12 ký tự dễ đọc dạng XXXX-XXXX-XXXX (bỏ 0/O, 1/I)
 */
export function generateLearnerRecoveryCode(): {
  formatted: string;
  normalized: string;
} {
  const bytes = crypto.randomBytes(12);
  let chars = "";
  for (let i = 0; i < 12; i += 1) {
    const idx = (bytes[i] ?? 0) % JOIN_CODE_ALPHABET.length;
    chars += JOIN_CODE_ALPHABET[idx];
  }
  const formatted = `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  return {
    formatted,
    normalized: chars,
  };
}

export type PomodoroPhase = "work" | "short_break" | "long_break";

export interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
}

export const STANDARD_POMODORO_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
};

export const KIDS_POMODORO_SETTINGS: PomodoroSettings = {
  workMinutes: 10,
  shortBreakMinutes: 3,
  longBreakMinutes: 10,
  cyclesBeforeLongBreak: 4,
};

/**
 * Chuyển trạng thái sang pha kế tiếp của đồng hồ Pomodoro
 */
export function getNextPomodoroPhase(params: {
  currentPhase: PomodoroPhase;
  completedWorkCycles: number;
  settings: PomodoroSettings;
}): {
  nextPhase: PomodoroPhase;
  nextCompletedWorkCycles: number;
  durationSeconds: number;
} {
  const { currentPhase, completedWorkCycles, settings } = params;

  if (currentPhase === "work") {
    const nextCycles = completedWorkCycles + 1;
    if (nextCycles % settings.cyclesBeforeLongBreak === 0) {
      return {
        nextPhase: "long_break",
        nextCompletedWorkCycles: nextCycles,
        durationSeconds: Math.max(1, settings.longBreakMinutes) * 60,
      };
    }
    return {
      nextPhase: "short_break",
      nextCompletedWorkCycles: nextCycles,
      durationSeconds: Math.max(1, settings.shortBreakMinutes) * 60,
    };
  }

  return {
    nextPhase: "work",
    nextCompletedWorkCycles: completedWorkCycles,
    durationSeconds: Math.max(1, settings.workMinutes) * 60,
  };
}

/**
 * Kiểm tra xem thời điểm hiện tại ở Việt Nam có sau giờ đi ngủ khuyến nghị (mặc định 22:00) không
 */
export function isLateNightStudyTime(
  now: Date,
  lateHourThreshold = 22
): boolean {
  const hour = getVietnamHour(now);
  return hour >= lateHourThreshold || hour < 4;
}

