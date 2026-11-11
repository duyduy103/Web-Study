import { vi } from "@/lib/i18n/vi";
import { normalizeInlineWhitespace } from "@/lib/parsing/normalize";
import { computeMcqConfidence } from "@/lib/parsing/match-answer-key";
import type {
  ParsedChoice,
  ParsedQuestion,
  SpreadsheetColumnMapping,
} from "@/lib/parsing/types";

/**
 * Tự động đoán ánh xạ cột dựa trên tên cột tiếng Việt hoặc tiếng Anh phổ biến.
 */
export function guessSpreadsheetMapping(
  headers: string[]
): SpreadsheetColumnMapping {
  const findCol = (patterns: RegExp[]): string | undefined => {
    for (const pattern of patterns) {
      const found = headers.find((h) => pattern.test(h.trim()));
      if (found) {
        return found;
      }
    }
    return undefined;
  };

  const stemCol =
    findCol([
      /^(câu\s*hỏi|nội\s*dung(\s*câu\s*hỏi)?|đề\s*bài|question|stem|prompt)$/i,
      /(câu\s*hỏi|question|đề\s*bài)/i,
    ]) ??
    headers[0] ??
    "";

  const correctCol =
    findCol([
      /^(đáp\s*án(\s*đúng)?|đa|correct(\s*answer)?|answer|key|kết\s*quả)$/i,
      /(đáp\s*án\s*đúng|correct|đáp\s*án|answer)/i,
    ]) ??
    headers[1] ??
    "";

  const optionACol = findCol([
    /^(a|lựa\s*chọn\s*a|đáp\s*án\s*a|phương\s*án\s*a|option\s*a|choice\s*a|đáp\s*án\s*sai\s*1|distractor\s*1)$/i,
    /\b(cột\s*a|phương\s*án\s*a|lựa\s*chọn\s*a|option\s*a)\b/i,
  ]);

  const optionBCol = findCol([
    /^(b|lựa\s*chọn\s*b|đáp\s*án\s*b|phương\s*án\s*b|option\s*b|choice\s*b|đáp\s*án\s*sai\s*2|distractor\s*2)$/i,
    /\b(cột\s*b|phương\s*án\s*b|lựa\s*chọn\s*b|option\s*b)\b/i,
  ]);

  const optionCCol = findCol([
    /^(c|lựa\s*chọn\s*c|đáp\s*án\s*c|phương\s*án\s*c|option\s*c|choice\s*c|đáp\s*án\s*sai\s*3|distractor\s*3)$/i,
    /\b(cột\s*c|phương\s*án\s*c|lựa\s*chọn\s*c|option\s*c)\b/i,
  ]);

  const optionDCol = findCol([
    /^(d|lựa\s*chọn\s*d|đáp\s*án\s*d|phương\s*án\s*d|option\s*d|choice\s*d|đáp\s*án\s*sai\s*4|distractor\s*4)$/i,
    /\b(cột\s*d|phương\s*án\s*d|lựa\s*chọn\s*d|option\s*d)\b/i,
  ]);

  const explanationCol = findCol([
    /^(giải\s*thích|hướng\s*dẫn|lời\s*giải|explanation|note|ghi\s*chú)$/i,
    /(giải\s*thích|explanation)/i,
  ]);

  const topicCol = findCol([
    /^(chủ\s*đề|chương|bài|topic|category)$/i,
    /(chủ\s*đề|topic)/i,
  ]);

  const difficultyCol = findCol([
    /^(độ\s*khó|mức\s*độ|difficulty|level)$/i,
    /(độ\s*khó|difficulty)/i,
  ]);

  return {
    stemCol,
    correctCol,
    optionACol,
    optionBCol,
    optionCCol,
    optionDCol,
    explanationCol,
    topicCol,
    difficultyCol,
  };
}

export function parseSpreadsheetRows(
  rows: Record<string, string>[],
  mapping: SpreadsheetColumnMapping
): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  const isDistractorMode = [
    mapping.optionACol,
    mapping.optionBCol,
    mapping.optionCCol,
  ].some((col) => col && /sai|distractor/i.test(col));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawStem = row[mapping.stemCol] ?? "";
    const stem = normalizeInlineWhitespace(rawStem);

    if (!stem) {
      continue;
    }

    const rawCorrect = normalizeInlineWhitespace(
      row[mapping.correctCol] ?? ""
    );
    const explanation = mapping.explanationCol
      ? normalizeInlineWhitespace(row[mapping.explanationCol] ?? "") || undefined
      : undefined;
    const topic = mapping.topicCol
      ? normalizeInlineWhitespace(row[mapping.topicCol] ?? "") || undefined
      : undefined;
    const difficulty = mapping.difficultyCol
      ? normalizeInlineWhitespace(row[mapping.difficultyCol] ?? "") || undefined
      : undefined;

    const optA = mapping.optionACol
      ? normalizeInlineWhitespace(row[mapping.optionACol] ?? "")
      : "";
    const optB = mapping.optionBCol
      ? normalizeInlineWhitespace(row[mapping.optionBCol] ?? "")
      : "";
    const optC = mapping.optionCCol
      ? normalizeInlineWhitespace(row[mapping.optionCCol] ?? "")
      : "";
    const optD = mapping.optionDCol
      ? normalizeInlineWhitespace(row[mapping.optionDCol] ?? "")
      : "";

    const hasOptions = Boolean(optA || optB || optC || optD);
    const warnings: string[] = [];
    const sourceRef = `Hàng ${i + 2}`;

    if (stem.length < 8) {
      warnings.push(vi.parsing.warnings.shortStem);
    }

    if (!hasOptions) {
      if (!rawCorrect) {
        warnings.push(vi.parsing.warnings.missingAnswer);
      }
      const isCloze = /_{3,}|\.{4,}|\[\s*\.\.\.\s*\]/.test(stem);
      const isTrueFalse = /^(đúng|sai|true|false|đ|s)$/i.test(rawCorrect);

      if (isTrueFalse && rawCorrect) {
        const isTrue = /^(đúng|true|đ)$/i.test(rawCorrect);
        questions.push({
          type: "true_false",
          stem,
          choices: [
            { text: vi.setDetails.trueValue, isCorrect: isTrue },
            { text: vi.setDetails.falseValue, isCorrect: !isTrue },
          ],
          explanation,
          topic,
          difficulty,
          confidence: warnings.length === 0 ? 0.95 : 0.5,
          warnings,
          sourceRef,
        });
      } else {
        questions.push({
          type: isCloze ? "cloze" : "short_answer",
          stem,
          answerText: rawCorrect || undefined,
          explanation,
          topic,
          difficulty,
          confidence: !rawCorrect ? 0.3 : warnings.length === 0 ? 0.94 : 0.7,
          warnings,
          sourceRef,
        });
      }
      continue;
    }

    // Có các cột lựa chọn
    const choices: ParsedChoice[] = [];

    if (isDistractorMode) {
      if (rawCorrect) {
        choices.push({ text: rawCorrect, isCorrect: true });
      }
      [optA, optB, optC, optD].forEach((d) => {
        if (d) {
          choices.push({ text: d, isCorrect: false });
        }
      });
    } else {
      const rawEntries = [
        { letter: "A", text: optA },
        { letter: "B", text: optB },
        { letter: "C", text: optC },
        { letter: "D", text: optD },
      ].filter((item) => item.text.length > 0);

      const normalizedCorrect = rawCorrect.toUpperCase().replace(/[.)]/g, "").trim();

      for (const entry of rawEntries) {
        const isLetterMatch = normalizedCorrect === entry.letter;
        const isTextMatch =
          rawCorrect.length > 0 &&
          entry.text.toLowerCase() === rawCorrect.toLowerCase();
        choices.push({
          text: entry.text,
          isCorrect: isLetterMatch || isTextMatch,
        });
      }
    }

    const correctCount = choices.filter((c) => c.isCorrect).length;
    if (!rawCorrect) {
      warnings.push(vi.parsing.warnings.missingAnswer);
    } else if (correctCount === 0) {
      warnings.push(vi.parsing.warnings.unmappedAnswerValue);
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

    const confidence = computeMcqConfidence(stem, choices, warnings);

    questions.push({
      type: "mcq",
      stem,
      choices,
      explanation,
      topic,
      difficulty,
      confidence,
      warnings,
      sourceRef,
    });
  }

  return questions;
}

