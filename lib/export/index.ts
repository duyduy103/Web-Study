import { buildDeterministicAttemptOrder } from "@/lib/grading";
import type { ExamQuestionWithSnapshot } from "@/lib/grading/types";
import type {
  BuiltPrintExamPackage,
  BuiltPrintExamVersion,
  CrossReferenceRow,
  CrossReferenceVersionCell,
  PrintExamHeaderInfo,
  PrintQuestionChoiceItem,
  PrintVersionQuestionItem,
} from "./types";

export const MAX_PRINT_QUESTIONS = 200;
export const MIN_PRINT_VERSIONS = 1;
export const MAX_PRINT_VERSIONS = 8;

/**
 * Sinh danh sách mã đề chuẩn 101, 102, ..., 108
 */
export function generateVersionCodes(versionCount: number): string[] {
  const clamped = Math.max(
    MIN_PRINT_VERSIONS,
    Math.min(MAX_PRINT_VERSIONS, Math.floor(versionCount) || 1)
  );
  const codes: string[] = [];
  for (let i = 1; i <= clamped; i += 1) {
    codes.push(String(100 + i));
  }
  return codes;
}

/**
 * Chuẩn hóa nội dung câu hỏi điền khuyết (cloze) khi in ra giấy:
 * Thay thế các ký hiệu chỗ trống như [...], [[...]], {...}, ___ bằng dòng kẻ ______
 */
export function formatClozeStemForPrint(rawStem: string): string {
  const replaced = rawStem
    .replace(/\[\[[^\]]*\]\]/g, "____________________")
    .replace(/\[\s*\.{2,}\s*\]/g, "____________________")
    .replace(/\[\s*blank\s*\]/gi, "____________________")
    .replace(/_{3,}/g, "____________________");

  if (replaced !== rawStem) {
    return replaced;
  }
  return `${rawStem.trim()} ____________________`;
}

/**
 * Dựng một mã đề cụ thể từ danh sách câu hỏi gốc và thứ tự questionOrder / choiceOrders
 */
export function buildSinglePrintVersion(params: {
  versionCode: string;
  originalQuestions: readonly ExamQuestionWithSnapshot[];
  originalNumberByEqId: ReadonlyMap<string, number>;
  questionOrder: readonly string[];
  choiceOrders: Readonly<Record<string, readonly string[]>>;
}): BuiltPrintExamVersion {
  const {
    versionCode,
    originalQuestions,
    originalNumberByEqId,
    questionOrder,
    choiceOrders,
  } = params;

  const questionByEqId = new Map(
    originalQuestions.map((q) => [q.examQuestionId, q])
  );

  const orderedItems: ExamQuestionWithSnapshot[] = [];
  for (const eqId of questionOrder) {
    const found = questionByEqId.get(eqId);
    if (found) {
      orderedItems.push(found);
    }
  }
  // Phòng hờ nếu questionOrder thiếu câu nào đó
  if (orderedItems.length < originalQuestions.length) {
    const included = new Set(orderedItems.map((q) => q.examQuestionId));
    for (const q of originalQuestions) {
      if (!included.has(q.examQuestionId)) {
        orderedItems.push(q);
      }
    }
  }

  const normalizedChoiceOrders: Record<string, string[]> = {};
  const versionQuestions: PrintVersionQuestionItem[] = orderedItems.map(
    (item, idx) => {
      const displayNumber = idx + 1;
      const originalNumber =
        originalNumberByEqId.get(item.examQuestionId) ?? displayNumber;
      const snap = item.snapshot;
      const rawChoices = snap.choices ?? [];

      const customChoiceOrder = choiceOrders[item.examQuestionId];
      let orderedRawChoices = [...rawChoices].sort(
        (a, b) => a.position - b.position
      );

      if (
        snap.type === "mcq" &&
        customChoiceOrder &&
        customChoiceOrder.length === rawChoices.length
      ) {
        const byId = new Map(rawChoices.map((c) => [c.id, c]));
        const mapped = customChoiceOrder
          .map((cId) => byId.get(cId))
          .filter((c): c is NonNullable<typeof c> => Boolean(c));
        if (mapped.length === rawChoices.length) {
          orderedRawChoices = mapped;
        }
      }

      normalizedChoiceOrders[item.examQuestionId] = orderedRawChoices.map(
        (c) => c.id
      );

      const choices: PrintQuestionChoiceItem[] = orderedRawChoices.map(
        (c, cIdx) => ({
          choiceId: c.id,
          label: String.fromCharCode(65 + cIdx),
          text: c.text,
          isCorrect: Boolean(c.is_correct),
        })
      );

      let correctAnswerDisplay = "";
      if (snap.type === "mcq") {
        const correctChoice = choices.find((c) => c.isCorrect);
        correctAnswerDisplay = correctChoice ? correctChoice.label : "?";
      } else if (snap.type === "true_false") {
        const correctChoice = choices.find((c) => c.isCorrect);
        correctAnswerDisplay = correctChoice
          ? correctChoice.text
          : snap.answer_text ?? "Đúng";
      } else {
        correctAnswerDisplay = snap.answer_text ?? "";
      }

      const displayStem =
        snap.type === "cloze" ? formatClozeStemForPrint(snap.stem) : snap.stem;

      const ansLen = (snap.answer_text ?? "").length;
      const shortAnswerLines =
        snap.type === "short_answer" ? (ansLen > 120 ? 4 : 3) : 0;

      return {
        examQuestionId: item.examQuestionId,
        originalNumber,
        displayNumber,
        points: Number(item.points) || 0,
        type: snap.type,
        stem: snap.stem,
        displayStem,
        choices,
        correctAnswerDisplay,
        answerText: snap.answer_text ?? null,
        acceptedVariants: snap.accepted_variants ?? [],
        explanation: snap.explanation ?? null,
        shortAnswerLines,
      };
    }
  );

  const quickAnswerSummary = versionQuestions
    .map((q) => `${q.displayNumber}-${q.correctAnswerDisplay}`)
    .join("   ");

  return {
    versionCode,
    questionOrder: versionQuestions.map((q) => q.examQuestionId),
    choiceOrders: normalizedChoiceOrders,
    questions: versionQuestions,
    quickAnswerSummary,
  };
}

/**
 * Xây dựng trọn gói đề in (1..8 mã đề, đáp án từng mã đề, và bảng đối chiếu câu gốc ↔ mã đề)
 * Đảm bảo tính xác định (deterministic): cùng danh sách câu hỏi và seed luôn ra kết quả giống hệt nhau.
 */
export function buildPrintExamPackage(params: {
  header: PrintExamHeaderInfo;
  questions: readonly ExamQuestionWithSnapshot[];
  versionCount?: number;
  seed: string;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  existingVersions?: ReadonlyArray<{
    code: string;
    question_order: readonly string[];
    choice_orders: Readonly<Record<string, readonly string[]>>;
  }>;
}): BuiltPrintExamPackage {
  const sortedOriginals = [...params.questions]
    .sort((a, b) => a.position - b.position)
    .slice(0, MAX_PRINT_QUESTIONS);

  const originalNumberByEqId = new Map<string, number>();
  sortedOriginals.forEach((q, idx) => {
    originalNumberByEqId.set(q.examQuestionId, idx + 1);
  });

  const totalPoints =
    Math.round(
      sortedOriginals.reduce((acc, q) => acc + (Number(q.points) || 0), 0) * 100
    ) / 100;

  let versions: BuiltPrintExamVersion[];

  if (params.existingVersions && params.existingVersions.length > 0) {
    const sortedExisting = [...params.existingVersions].sort((a, b) =>
      a.code.localeCompare(b.code)
    );
    versions = sortedExisting.map((ver) =>
      buildSinglePrintVersion({
        versionCode: ver.code,
        originalQuestions: sortedOriginals,
        originalNumberByEqId,
        questionOrder: ver.question_order,
        choiceOrders: ver.choice_orders,
      })
    );
  } else {
    const codes = generateVersionCodes(params.versionCount ?? 4);
    const structureInput = sortedOriginals.map((q) => ({
      examQuestionId: q.examQuestionId,
      choiceIds:
        q.snapshot.type === "mcq"
          ? (q.snapshot.choices ?? [])
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((c) => c.id)
          : [],
    }));

    versions = codes.map((versionCode) => {
      const versionSeed = `${params.seed.trim() || "memoquiz"}:code:${versionCode}`;
      const { questionOrder, choiceOrders } = buildDeterministicAttemptOrder({
        attemptSeed: versionSeed,
        questions: structureInput,
        shuffleQuestions: params.shuffleQuestions,
        shuffleChoices: params.shuffleChoices,
      });

      return buildSinglePrintVersion({
        versionCode,
        originalQuestions: sortedOriginals,
        originalNumberByEqId,
        questionOrder,
        choiceOrders,
      });
    });
  }

  // Xây dựng bảng đối chiếu câu gốc ↔ vị trí và đáp án ở từng mã đề
  const crossReference: CrossReferenceRow[] = sortedOriginals.map((orig, idx) => {
    const originalNumber = idx + 1;
    const byVersion: Record<string, CrossReferenceVersionCell> = {};

    for (const ver of versions) {
      const foundInVer = ver.questions.find(
        (vq) => vq.examQuestionId === orig.examQuestionId
      );
      if (foundInVer) {
        byVersion[ver.versionCode] = {
          versionCode: ver.versionCode,
          displayNumber: foundInVer.displayNumber,
          correctAnswerDisplay: foundInVer.correctAnswerDisplay,
        };
      }
    }

    const cleanStem = orig.snapshot.stem.replace(/\s+/g, " ").trim();
    const stemPreview =
      cleanStem.length > 65 ? `${cleanStem.slice(0, 62)}...` : cleanStem;

    return {
      examQuestionId: orig.examQuestionId,
      originalNumber,
      type: orig.snapshot.type,
      stemPreview,
      byVersion,
    };
  });

  return {
    header: params.header,
    seed: params.seed,
    shuffleQuestions: params.shuffleQuestions,
    shuffleChoices: params.shuffleChoices,
    totalPoints,
    originalQuestions: sortedOriginals,
    versions,
    crossReference,
  };
}

