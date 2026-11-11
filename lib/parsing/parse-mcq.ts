import { vi } from "@/lib/i18n/vi";
import { normalizeInlineWhitespace } from "@/lib/parsing/normalize";
import {
  computeMcqConfidence,
  extractAnswerKeyFromText,
  matchAnswerKey,
} from "@/lib/parsing/match-answer-key";
import type { ParsedChoice, ParsedQuestion } from "@/lib/parsing/types";

const EXPLICIT_QUESTION_START_REGEX =
  /^(?:Câu(?:\s*hỏi)?|Question|Bài)\s*(\d{1,4})\s*[:.)\/\-]?\s*(.*)$/i;

const BARE_NUMBER_START_REGEX = /^(\d{1,4})\s*[.)\/]\s+(.+)$/;

const INLINE_ANSWER_LINE_REGEX =
  /^(?:>>|=>|->|[-*•])?\s*(?:Đáp\s*án(?:\s*đúng|\s*câu\s*này)?|ĐA|Đ\/A|D\/A|Đ\.A|Answer|Key|Trả\s*lời)\s*(?:đúng\s*là|là|:|=|\-)\s*(.+)$/i;

const EXPLANATION_LINE_REGEX =
  /^(?:Giải\s*thích|Hướng\s*dẫn(?:\s*giải)?|Lời\s*giải|Ghi\s*chú|Explanation)\s*[:=\-]?\s*(.+)$/i;

const CHOICE_LINE_REGEX =
  /^(\[\[\s*CORRECT\s*\]\]\s*)?(?:[-•]\s*)?([*✓✔]|\[x\]|\(x\))?\s*([A-Da-d])\s*([.)\/\-:])\s*(.+)$/;

const NUMBERED_CHOICE_LINE_REGEX = /^([1-4])\s*[.)]\s+(.+)$/;

interface RawQuestionBlock {
  questionNumber: number;
  sourceLine: number;
  lines: string[];
}

export function parseMcqDocument(
  text: string,
  options?: { forceKeyTable?: boolean }
): { questions: ParsedQuestion[]; globalWarnings: string[] } {
  const { questionBodyText, answerMap, hasKeySection } =
    extractAnswerKeyFromText(text);

  const workingText =
    hasKeySection || options?.forceKeyTable ? questionBodyText : text;

  const blocks = splitIntoQuestionBlocks(workingText);
  const numberedQuestions: Array<{
    questionNumber: number;
    question: ParsedQuestion;
  }> = [];

  let prevNumber: number | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const parsed = parseSingleBlock(block, prevNumber);
    prevNumber = block.questionNumber;
    numberedQuestions.push({
      questionNumber: block.questionNumber,
      question: parsed,
    });
  }

  if (hasKeySection || (options?.forceKeyTable && answerMap.size > 0)) {
    return matchAnswerKey(numberedQuestions, answerMap);
  }

  return {
    questions: numberedQuestions.map((item) => item.question),
    globalWarnings: [],
  };
}

function blockHasLetterChoices(block: RawQuestionBlock): boolean {
  return block.lines.some((line) => CHOICE_LINE_REGEX.test(line.trim()));
}

function splitIntoQuestionBlocks(text: string): RawQuestionBlock[] {
  const lines = text.split("\n");
  const blocks: RawQuestionBlock[] = [];
  let current: RawQuestionBlock | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx].trim();
    if (!rawLine) {
      continue;
    }

    const cleanedForHeader = rawLine.replace(/^\[\[CORRECT\]\]\s*/i, "");

    // 1. Kiểm tra tiền tố tường minh: "Câu 1:", "Bài 3:", "Question 2."
    const explicitMatch = cleanedForHeader.match(EXPLICIT_QUESTION_START_REGEX);
    if (explicitMatch) {
      if (current) {
        blocks.push(current);
      }
      const qNum = Number(explicitMatch[1]);
      const rest = (explicitMatch[2] ?? "").trim();
      current = {
        questionNumber: Number.isNaN(qNum) ? blocks.length + 1 : qNum,
        sourceLine: idx + 1,
        lines: rest ? [rest] : [],
      };
      continue;
    }

    // 2. Kiểm tra số thứ tự đầu dòng: "1. ...", "1/ ...", "4. ..."
    const bareMatch = cleanedForHeader.match(BARE_NUMBER_START_REGEX);
    if (bareMatch) {
      const candidateNum = Number(bareMatch[1]);
      const rest = (bareMatch[2] ?? "").trim();

      // Phân biệt câu hỏi mới với lựa chọn đánh số 1. 2. 3. 4. bên trong một câu hỏi đang mở
      const isLikelyNumberedChoiceInsideCurrent =
        current !== null &&
        !blockHasLetterChoices(current) &&
        candidateNum >= 1 &&
        candidateNum <= 4 &&
        current.questionNumber > 1 &&
        candidateNum < current.questionNumber;

      // Trường hợp đã mở lựa chọn số 1. bên trong câu hỏi, các dòng 2. 3. 4. kế tiếp cũng là lựa chọn
      const currentAlreadyHasNumberedChoice =
        current !== null &&
        !blockHasLetterChoices(current) &&
        current.lines.some((l) => NUMBERED_CHOICE_LINE_REGEX.test(l));

      if (
        current !== null &&
        (isLikelyNumberedChoiceInsideCurrent ||
          (currentAlreadyHasNumberedChoice &&
            candidateNum >= 2 &&
            candidateNum <= 4))
      ) {
        current.lines.push(rawLine);
        continue;
      }

      if (current) {
        blocks.push(current);
      }

      current = {
        questionNumber: Number.isNaN(candidateNum)
          ? blocks.length + 1
          : candidateNum,
        sourceLine: idx + 1,
        lines: rest ? [rest] : [],
      };
      continue;
    }

    if (current) {
      current.lines.push(rawLine);
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

function splitInlineChoicesLine(line: string): string[] {
  const inlineRegex =
    /(?:^|\s{2,}|\t+)((?:\[\[CORRECT\]\]\s*)?(?:[*✓✔]|\([xX]\)|\[[xX]\])?\s*[A-Da-d][.)]\s+)/g;
  const matches = [...line.matchAll(inlineRegex)];
  if (matches.length <= 1) {
    return [line];
  }

  const segments: string[] = [];
  const firstIdx = matches[0].index ?? 0;
  if (firstIdx > 0) {
    const prefix = line.slice(0, firstIdx).trim();
    if (prefix) {
      segments.push(prefix);
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const start =
      (matches[i].index ?? 0) + (matches[i][0].length - matches[i][1].length);
    const end =
      i + 1 < matches.length
        ? matches[i + 1].index ?? line.length
        : line.length;
    const seg = line.slice(start, end).trim();
    if (seg) {
      segments.push(seg);
    }
  }

  return segments;
}

function extractAnswerTarget(rawAnswerText: string): {
  letter: string | null;
  isInformal: boolean;
} {
  const trimmed = rawAnswerText.trim();

  // Dạng chuẩn: "A", "B.", "C)"
  const strictMatch = trimmed.match(/^([A-Da-d])[.)]?$/);
  if (strictMatch) {
    return { letter: strictMatch[1].toUpperCase(), isInformal: false };
  }

  // Dạng số kèm chữ: "2 (tương ứng B)" hoặc chỉ số "2"
  const numMatch = trimmed.match(/^([1-4])\b/);
  if (numMatch) {
    const idx = Number(numMatch[1]) - 1;
    const mapped = String.fromCharCode("A".charCodeAt(0) + idx);
    return { letter: mapped, isInformal: true };
  }

  // Dạng tự do: "đúng là B nhé", "chọn C"
  const looseLetterMatch = trimmed.match(/\b([A-Da-d])\b/);
  if (looseLetterMatch) {
    return { letter: looseLetterMatch[1].toUpperCase(), isInformal: true };
  }

  return { letter: null, isInformal: true };
}

function parseSingleBlock(
  block: RawQuestionBlock,
  prevQuestionNumber: number | null
): ParsedQuestion {
  const expandedLines: string[] = [];
  for (const line of block.lines) {
    expandedLines.push(...splitInlineChoicesLine(line));
  }

  const stemParts: string[] = [];
  const rawChoices: Array<{
    letter: string;
    separator: string;
    text: string;
    isCorrect: boolean;
  }> = [];
  const numberedChoices: Array<{ num: number; text: string }> = [];

  let explicitAnswerRaw: string | null = null;
  let answerLineHadInformalPrefix = false;
  const explanationParts: string[] = [];
  const warnings: string[] = [];

  if (
    prevQuestionNumber !== null &&
    block.questionNumber > prevQuestionNumber + 1
  ) {
    warnings.push(
      `${vi.parsing.warnings.skippedNumberPrefix} ${prevQuestionNumber} ${vi.parsing.warnings.skippedNumberMiddle} ${block.questionNumber}${vi.parsing.warnings.skippedNumberSuffix}`
    );
  }

  let mode: "stem" | "choices" | "explanation" = "stem";

  for (const rawLine of expandedLines) {
    const cleanLine = rawLine.replace(/^\[\[CORRECT\]\]\s*/i, "").trim();

    const ansMatch = cleanLine.match(INLINE_ANSWER_LINE_REGEX);
    if (ansMatch) {
      explicitAnswerRaw = ansMatch[1].trim();
      if (/^(?:>>|=>|->)/.test(cleanLine) || /câu\s*này|đúng\s*là/i.test(cleanLine)) {
        answerLineHadInformalPrefix = true;
      }
      continue;
    }

    const expMatch = cleanLine.match(EXPLANATION_LINE_REGEX);
    if (expMatch) {
      mode = "explanation";
      explanationParts.push(expMatch[1].trim());
      continue;
    }

    const choiceMatch = rawLine.match(CHOICE_LINE_REGEX);
    if (choiceMatch) {
      mode = "choices";
      const hasFormattedCorrect = Boolean(choiceMatch[1]);
      const hasSymbolCorrect = Boolean(choiceMatch[2]);
      const letter = choiceMatch[3].toUpperCase();
      const separator = choiceMatch[4];
      const choiceText = normalizeInlineWhitespace(
        choiceMatch[5].replace(/\[\[CORRECT\]\]/gi, "")
      );
      rawChoices.push({
        letter,
        separator,
        text: choiceText,
        isCorrect: hasFormattedCorrect || hasSymbolCorrect,
      });
      continue;
    }

    const numChoiceMatch = cleanLine.match(NUMBERED_CHOICE_LINE_REGEX);
    if (numChoiceMatch && rawChoices.length === 0) {
      mode = "choices";
      numberedChoices.push({
        num: Number(numChoiceMatch[1]),
        text: normalizeInlineWhitespace(numChoiceMatch[2]),
      });
      continue;
    }

    if (mode === "stem") {
      stemParts.push(cleanLine);
    } else if (mode === "choices" && rawChoices.length > 0) {
      const last = rawChoices[rawChoices.length - 1];
      last.text = normalizeInlineWhitespace(`${last.text} ${cleanLine}`);
    } else if (mode === "choices" && numberedChoices.length > 0) {
      const last = numberedChoices[numberedChoices.length - 1];
      last.text = normalizeInlineWhitespace(`${last.text} ${cleanLine}`);
    } else if (mode === "explanation") {
      explanationParts.push(cleanLine);
    }
  }

  // Nếu câu hỏi dùng lựa chọn đánh số 1. 2. 3. 4. thay vì A. B. C. D.
  if (rawChoices.length === 0 && numberedChoices.length >= 2) {
    warnings.push(vi.parsing.warnings.numberedChoicesUsed);
    numberedChoices.forEach((nc, idx) => {
      const letter = String.fromCharCode("A".charCodeAt(0) + idx);
      rawChoices.push({
        letter,
        separator: ".",
        text: nc.text,
        isCorrect: false,
      });
    });
  }

  // Kiểm tra ký hiệu phân tách lựa chọn không chuẩn ('/' hoặc '-')
  if (rawChoices.some((c) => c.separator === "/" || c.separator === "-")) {
    warnings.push(vi.parsing.warnings.inconsistentChoiceMarkers);
  }

  const stem = normalizeInlineWhitespace(stemParts.join(" "));
  const explanation =
    explanationParts.length > 0
      ? normalizeInlineWhitespace(explanationParts.join(" "))
      : undefined;
  const sourceRef = `Câu ${block.questionNumber} (dòng ${block.sourceLine})`;

  // Áp dụng dòng đáp án ngay dưới câu hỏi (nếu có)
  if (explicitAnswerRaw && rawChoices.length > 0) {
    const { letter, isInformal } = extractAnswerTarget(explicitAnswerRaw);
    if (isInformal || answerLineHadInformalPrefix) {
      warnings.push(vi.parsing.warnings.informalAnswerLine);
    }

    if (letter) {
      rawChoices.forEach((c) => {
        c.isCorrect = c.letter === letter;
      });
    } else {
      const normalizedAns = normalizeInlineWhitespace(
        explicitAnswerRaw
      ).toLowerCase();
      rawChoices.forEach((c) => {
        if (c.text.toLowerCase() === normalizedAns) {
          c.isCorrect = true;
        }
      });
    }
  }

  if (rawChoices.length === 0) {
    return buildNonChoiceQuestionInMcqDoc(
      stem,
      explicitAnswerRaw,
      explanation,
      warnings,
      sourceRef
    );
  }

  const choices: ParsedChoice[] = rawChoices.map((c) => ({
    text: c.text,
    isCorrect: c.isCorrect,
  }));

  const correctCount = choices.filter((c) => c.isCorrect).length;
  if (correctCount === 0) {
    warnings.push(vi.parsing.warnings.missingAnswer);
  } else if (correctCount > 1) {
    warnings.push(vi.parsing.warnings.multipleCorrectChoices);
  }

  if (choices.length < 2) {
    warnings.push(vi.parsing.warnings.tooFewChoices);
  } else if (choices.length === 2) {
    warnings.push(vi.parsing.warnings.onlyTwoChoicesMcq);
  } else if (choices.length !== 4) {
    warnings.push(vi.parsing.warnings.oddChoiceCount);
  }

  if (stem.length < 8) {
    warnings.push(vi.parsing.warnings.shortStem);
  }

  const uniqueTexts = new Set(choices.map((c) => c.text.toLowerCase()));
  if (uniqueTexts.size < choices.length) {
    warnings.push(vi.parsing.warnings.duplicateChoiceText);
  }

  let confidence = computeMcqConfidence(stem, choices, warnings);
  if (warnings.includes(vi.parsing.warnings.numberedChoicesUsed)) {
    confidence = Math.min(confidence, 0.68);
  }
  if (warnings.includes(vi.parsing.warnings.inconsistentChoiceMarkers)) {
    confidence = Math.min(confidence, 0.74);
  }
  if (warnings.includes(vi.parsing.warnings.informalAnswerLine)) {
    confidence = Math.min(confidence, 0.72);
  }

  return {
    type: "mcq",
    stem,
    choices,
    explanation,
    confidence,
    warnings,
    sourceRef,
  };
}

function buildNonChoiceQuestionInMcqDoc(
  stem: string,
  explicitAnswerRaw: string | null,
  explanation: string | undefined,
  warnings: string[],
  sourceRef: string
): ParsedQuestion {
  const answerText = explicitAnswerRaw
    ? normalizeInlineWhitespace(explicitAnswerRaw)
    : undefined;

  warnings.push(vi.parsing.warnings.tooFewChoices);
  if (stem.length < 8) {
    warnings.push(vi.parsing.warnings.shortStem);
  }
  if (!answerText) {
    warnings.push(vi.parsing.warnings.missingAnswer);
  }

  return {
    type: "short_answer",
    stem,
    answerText,
    explanation,
    confidence: answerText ? 0.45 : 0.25,
    warnings,
    sourceRef,
  };
}
