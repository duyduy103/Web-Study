import type {
  AttemptSubmissionGuardInput,
  AttemptSubmissionGuardResult,
  ExamQuestionSnapshot,
  ExamQuestionWithSnapshot,
  GradedAttemptResult,
  GradedQuestionResult,
  StudentSanitizedQuestion,
} from "@/lib/grading/types";

export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const EDGE_PUNCTUATION_REGEX =
  /^[.,;:!?'"()[\]{}«»“”‘’\-–—_]+|[.,;:!?'"()[\]{}«»“”‘’\-–—_]+$/g;

/**
 * Chuẩn hóa chuỗi câu trả lời tiếng Việt để so khớp:
 * - Chuẩn hóa Unicode về dạng dựng sẵn NFC
 * - Gộp nhiều khoảng trắng liên tiếp thành 1 khoảng trắng
 * - Không phân biệt chữ hoa / chữ thường
 * - Tùy chọn bỏ dấu câu nhẹ ở hai đầu (mặc định bật)
 */
export function normalizeAnswerText(
  input: string | null | undefined,
  options?: { stripEdgePunctuation?: boolean }
): string {
  if (!input) return "";

  const stripPunct = options?.stripEdgePunctuation ?? true;
  let text = input
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (stripPunct) {
    text = text.replace(EDGE_PUNCTUATION_REGEX, "").trim();
  }

  return text;
}

/**
 * Kiểm tra câu trả lời dạng văn bản có khớp với đáp án chuẩn hoặc danh sách biến thể chấp nhận không
 */
export function isTextAnswerMatched(
  rawStudentResponse: string | null | undefined,
  expectedAnswerText: string | null | undefined,
  acceptedVariants: readonly string[] = []
): boolean {
  const normalizedStudent = normalizeAnswerText(rawStudentResponse);
  if (!normalizedStudent) return false;

  const candidates: string[] = [];
  if (expectedAnswerText && expectedAnswerText.trim().length > 0) {
    candidates.push(expectedAnswerText);
  }
  for (const variant of acceptedVariants) {
    if (variant && variant.trim().length > 0) {
      candidates.push(variant);
    }
  }

  for (const candidate of candidates) {
    if (normalizeAnswerText(candidate) === normalizedStudent) {
      return true;
    }
  }

  return false;
}

/**
 * Chấm một câu hỏi đơn lẻ dựa trên bản chụp (snapshot) tại thời điểm tạo đề
 */
export function gradeSingleQuestion(
  item: ExamQuestionWithSnapshot,
  rawResponse: string | null | undefined
): GradedQuestionResult {
  const cleanRaw = (rawResponse ?? "").slice(0, 2000);
  const trimmedResponse = cleanRaw.trim();
  const normalizedResponse = normalizeAnswerText(cleanRaw);
  const snapshot = item.snapshot;
  const maxPoints = Number(item.points) || 0;

  if (snapshot.type === "mcq" || snapshot.type === "true_false") {
    if (!trimmedResponse) {
      return {
        examQuestionId: item.examQuestionId,
        questionId: item.questionId,
        response: cleanRaw,
        normalizedResponse: "",
        isCorrect: false,
        pointsAwarded: 0,
        maxPoints,
        needsManualReview: false,
      };
    }

    const correctChoice = snapshot.choices.find((c) => c.is_correct);
    const isMatched = Boolean(
      correctChoice &&
        (correctChoice.id === trimmedResponse ||
          normalizeAnswerText(correctChoice.text) === normalizedResponse)
    );

    return {
      examQuestionId: item.examQuestionId,
      questionId: item.questionId,
      response: cleanRaw,
      normalizedResponse,
      isCorrect: isMatched,
      pointsAwarded: isMatched ? maxPoints : 0,
      maxPoints,
      needsManualReview: false,
    };
  }

  if (snapshot.type === "cloze") {
    if (!normalizedResponse) {
      return {
        examQuestionId: item.examQuestionId,
        questionId: item.questionId,
        response: cleanRaw,
        normalizedResponse: "",
        isCorrect: false,
        pointsAwarded: 0,
        maxPoints,
        needsManualReview: false,
      };
    }

    const matched = isTextAnswerMatched(
      cleanRaw,
      snapshot.answer_text,
      snapshot.accepted_variants ?? []
    );

    return {
      examQuestionId: item.examQuestionId,
      questionId: item.questionId,
      response: cleanRaw,
      normalizedResponse,
      isCorrect: matched,
      pointsAwarded: matched ? maxPoints : 0,
      maxPoints,
      needsManualReview: false,
    };
  }

  // Loại short_answer:
  // - Nếu bỏ trống -> 0 điểm ngay, không cần giáo viên chấm
  // - Nếu khớp tự động -> đủ điểm
  // - Nếu có trả lời nhưng không khớp tự động -> đánh dấu needsManualReview = true (không kết luận sai cứng)
  if (!normalizedResponse) {
    return {
      examQuestionId: item.examQuestionId,
      questionId: item.questionId,
      response: cleanRaw,
      normalizedResponse: "",
      isCorrect: false,
      pointsAwarded: 0,
      maxPoints,
      needsManualReview: false,
    };
  }

  const matched = isTextAnswerMatched(
    cleanRaw,
    snapshot.answer_text,
    snapshot.accepted_variants ?? []
  );

  if (matched) {
    return {
      examQuestionId: item.examQuestionId,
      questionId: item.questionId,
      response: cleanRaw,
      normalizedResponse,
      isCorrect: true,
      pointsAwarded: maxPoints,
      maxPoints,
      needsManualReview: false,
    };
  }

  return {
    examQuestionId: item.examQuestionId,
    questionId: item.questionId,
    response: cleanRaw,
    normalizedResponse,
    isCorrect: null,
    pointsAwarded: 0,
    maxPoints,
    needsManualReview: true,
  };
}

/**
 * Chấm toàn bộ lượt làm bài của học sinh trên server
 */
export function gradeAttempt(
  questions: readonly ExamQuestionWithSnapshot[],
  responsesByExamQuestionId: Readonly<Record<string, string | null | undefined>>
): GradedAttemptResult {
  const gradedAnswers: GradedQuestionResult[] = [];
  let rawAwardedSum = 0;
  let maxPointsSum = 0;
  let correctCount = 0;
  let pendingReviewCount = 0;

  for (const q of questions) {
    const response = responsesByExamQuestionId[q.examQuestionId] ?? "";
    const graded = gradeSingleQuestion(q, response);
    gradedAnswers.push(graded);

    rawAwardedSum += graded.pointsAwarded;
    maxPointsSum += graded.maxPoints;
    if (graded.isCorrect === true) {
      correctCount += 1;
    }
    if (graded.needsManualReview) {
      pendingReviewCount += 1;
    }
  }

  const score = Math.round(rawAwardedSum * 100) / 100;
  const maxPoints = Math.round(maxPointsSum * 100) / 100;

  return {
    score,
    maxPoints,
    correctCount,
    pendingReviewCount,
    needsManualReview: pendingReviewCount > 0,
    gradedAnswers,
  };
}

/**
 * Sinh mã tham gia 6 ký tự (loại bỏ các ký tự dễ nhầm như 0/O, 1/I)
 */
export function generateExamJoinCode(randomBytes?: Uint8Array): string {
  const bytes = randomBytes ?? new Uint8Array(6);
  if (!randomBytes) {
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 6; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
  }

  let code = "";
  for (let i = 0; i < 6; i += 1) {
    const idx = (bytes[i] ?? 0) % JOIN_CODE_ALPHABET.length;
    code += JOIN_CODE_ALPHABET[idx];
  }
  return code;
}

/**
 * Hàm băm chuỗi seed thành số nguyên 32-bit không dấu (FNV-1a)
 */
export function hashStringSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Bộ sinh số giả ngẫu nhiên có seed cố định (Mulberry32)
 */
export function createSeededRandom(seedString: string): () => number {
  let state = hashStringSeed(seedString) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Trộn mảng cố định theo seed (Fisher-Yates) — cùng seed luôn ra cùng thứ tự
 */
export function deterministicShuffle<T>(
  items: readonly T[],
  seedString: string
): T[] {
  const result = [...items];
  const rand = createSeededRandom(seedString);
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

/**
 * Tạo thứ tự câu hỏi và thứ tự lựa chọn cố định cho một lượt làm bài
 */
export function buildDeterministicAttemptOrder(params: {
  attemptSeed: string;
  questions: ReadonlyArray<{
    examQuestionId: string;
    choiceIds: readonly string[];
  }>;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
}): {
  questionOrder: string[];
  choiceOrders: Record<string, string[]>;
} {
  const baseIds = params.questions.map((q) => q.examQuestionId);
  const questionOrder = params.shuffleQuestions
    ? deterministicShuffle(baseIds, `${params.attemptSeed}:questions`)
    : baseIds;

  const choiceOrders: Record<string, string[]> = {};
  for (const q of params.questions) {
    if (q.choiceIds.length > 0) {
      choiceOrders[q.examQuestionId] = params.shuffleChoices
        ? deterministicShuffle(
            q.choiceIds,
            `${params.attemptSeed}:choices:${q.examQuestionId}`
          )
        : [...q.choiceIds];
    }
  }

  return { questionOrder, choiceOrders };
}

/**
 * Kiểm tra bảo mật trước khi lưu nháp hoặc nộp bài:
 * - Khớp attempt_token
 * - Chưa nộp trước đó
 * - Bài kiểm tra đang mở và trong khung giờ
 * - Kiểm tra hạn giờ làm bài (deadline_at)
 */
export function validateAttemptSubmissionGuard(
  input: AttemptSubmissionGuardInput
): AttemptSubmissionGuardResult {
  const cleanExpected = input.expectedToken.trim();
  const cleanProvided = input.providedToken.trim();

  if (
    !cleanExpected ||
    !cleanProvided ||
    cleanExpected.length < 32 ||
    cleanExpected !== cleanProvided
  ) {
    return {
      allowed: false,
      isExpiredSubmission: false,
      errorCode: "INVALID_TOKEN",
    };
  }

  if (input.attemptStatus !== "in_progress") {
    return {
      allowed: false,
      isExpiredSubmission: false,
      errorCode: "ATTEMPT_ALREADY_SUBMITTED",
    };
  }

  if (!input.examIsOpen) {
    return {
      allowed: false,
      isExpiredSubmission: false,
      errorCode: "EXAM_CLOSED",
    };
  }

  const nowMs = new Date(input.nowIso).getTime();

  if (input.opensAt) {
    const opensMs = new Date(input.opensAt).getTime();
    if (nowMs < opensMs) {
      return {
        allowed: false,
        isExpiredSubmission: false,
        errorCode: "EXAM_NOT_YET_OPEN",
      };
    }
  }

  const graceMs = (input.graceSeconds ?? 15) * 1000;

  if (input.closesAt) {
    const closesMs = new Date(input.closesAt).getTime();
    if (nowMs > closesMs + graceMs) {
      return {
        allowed: false,
        isExpiredSubmission: true,
        errorCode: "EXAM_EXPIRED_WINDOW",
      };
    }
  }

  if (input.deadlineAt) {
    const deadlineMs = new Date(input.deadlineAt).getTime();
    if (nowMs > deadlineMs + graceMs) {
      return {
        allowed: false,
        isExpiredSubmission: true,
        errorCode: "ATTEMPT_TIME_EXPIRED",
      };
    }
  }

  return {
    allowed: true,
    isExpiredSubmission: false,
    errorCode: null,
  };
}

/**
 * Loại bỏ hoàn toàn đáp án đúng và giải thích khỏi dữ liệu câu hỏi trước khi trả về trình duyệt học sinh
 */
export function sanitizeQuestionForStudent(
  item: ExamQuestionWithSnapshot,
  revealAnswers: boolean
): StudentSanitizedQuestion {
  const snap: ExamQuestionSnapshot = item.snapshot;
  return {
    examQuestionId: item.examQuestionId,
    questionId: item.questionId,
    points: item.points,
    position: item.position,
    type: snap.type,
    stem: snap.stem,
    choices: (snap.choices ?? []).map((c) =>
      revealAnswers
        ? {
            id: c.id,
            text: c.text,
            position: c.position,
            is_correct: c.is_correct,
          }
        : {
            id: c.id,
            text: c.text,
            position: c.position,
          }
    ),
    answer_text: revealAnswers ? snap.answer_text : null,
    explanation: revealAnswers ? snap.explanation : null,
  };
}

