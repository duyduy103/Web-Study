import { extractAnswerKeyFromText } from "@/lib/parsing/match-answer-key";
import type {
  DocumentFormat,
  ExtractedDocument,
  FormatDetectionResult,
} from "@/lib/parsing/types";

const CHOICE_LINE_PATTERN =
  /^(?:\[\[CORRECT\]\]\s*)?(?:[*✓✔]|\([xX]\)|\[[xX]\])?\s*[A-Da-d]\s*[.)]\s+.+/m;

const INLINE_ANSWER_PATTERN =
  /^(?:Đáp\s*án(?:\s*đúng)?|ĐA|Đ\/A|Đ\.A|Answer|Key)\s*[:=\-]\s*[A-Da-d]\b/im;

const QA_PAIR_PATTERN =
  /^(?:Trả\s*lời|Đáp\s*án|Gợi\s*ý(?:\s*trả\s*lời)?|TL|A)\s*[:=\-]\s*.+/im;

const TRUE_FALSE_ANSWER_PATTERN =
  /^(?:Đáp\s*án|Trả\s*lời|ĐA)\s*[:=\-]\s*(?:Đúng|Sai|True|False)\s*$/im;

const CLOZE_BLANK_PATTERN = /_{3,}|\.{4,}|\[\s*\.\.\.\s*\]/;

export function detectFormat(
  doc: ExtractedDocument | string
): FormatDetectionResult {
  if (typeof doc !== "string" && doc.isSpreadsheet) {
    return {
      format: "spreadsheet",
      confidence: 0.98,
    };
  }

  const text = typeof doc === "string" ? doc : doc.markedText ?? doc.text;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { format: "mcq_inline", confidence: 0.2 };
  }

  const { hasKeySection, answerMap } = extractAnswerKeyFromText(text);
  const choiceLinesCount = lines.filter((l) =>
    CHOICE_LINE_PATTERN.test(l)
  ).length;

  // 1. Có lựa chọn A/B/C/D và bảng đáp án ở cuối đề
  if (hasKeySection && answerMap.size >= 2 && choiceLinesCount >= 4) {
    return {
      format: "mcq_with_key_table",
      confidence: 0.95,
    };
  }

  // 2. Có lựa chọn A/B/C/D ngay trong từng câu (kèm dòng Đáp án: X hoặc đánh dấu */in đậm/gạch chân)
  if (choiceLinesCount >= 2) {
    const hasInlineMarks =
      INLINE_ANSWER_PATTERN.test(text) ||
      /\[\[CORRECT\]\]|^[*✓✔]\s*[A-Da-d][.)]/m.test(text);
    return {
      format: "mcq_inline",
      confidence: hasInlineMarks ? 0.94 : 0.75,
    };
  }

  // 3. Kiểm tra Đúng / Sai
  const tfMatches = lines.filter((l) => TRUE_FALSE_ANSWER_PATTERN.test(l)).length;
  if (tfMatches >= 2) {
    return {
      format: "true_false",
      confidence: 0.88,
    };
  }

  // 4. Kiểm tra Điền khuyết (Cloze)
  const clozeMatches = lines.filter((l) => CLOZE_BLANK_PATTERN.test(l)).length;
  if (clozeMatches >= 2 && choiceLinesCount === 0) {
    return {
      format: "cloze",
      confidence: 0.86,
    };
  }

  // 5. Hỏi - Đáp ngắn (qa_pairs)
  if (QA_PAIR_PATTERN.test(text)) {
    return {
      format: "qa_pairs",
      confidence: 0.92,
    };
  }

  const fallbackFormat: DocumentFormat =
    choiceLinesCount > 0 ? "mcq_inline" : "qa_pairs";

  return {
    format: fallbackFormat,
    confidence: 0.6,
  };
}

