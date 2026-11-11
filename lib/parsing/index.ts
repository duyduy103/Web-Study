import { extractText, type ExtractInput } from "@/lib/parsing/extract-text";
import { detectFormat } from "@/lib/parsing/detect-format";
import { parseMcqDocument } from "@/lib/parsing/parse-mcq";
import { parseQaDocument } from "@/lib/parsing/parse-qa";
import {
  guessSpreadsheetMapping,
  parseSpreadsheetRows,
} from "@/lib/parsing/parse-spreadsheet";
import {
  extractAnswerKeyFromText,
  matchAnswerKey,
} from "@/lib/parsing/match-answer-key";
import { normalizeText, normalizeInlineWhitespace } from "@/lib/parsing/normalize";
import type {
  DocumentFormat,
  ExtractedDocument,
  ParseDocumentResult,
  ParsedQuestion,
  SpreadsheetColumnMapping,
} from "@/lib/parsing/types";

export {
  extractText,
  detectFormat,
  matchAnswerKey,
  extractAnswerKeyFromText,
  guessSpreadsheetMapping,
  parseSpreadsheetRows,
  normalizeText,
  normalizeInlineWhitespace,
};

export type {
  ExtractInput,
  DocumentFormat,
  ExtractedDocument,
  ParseDocumentResult,
  ParsedQuestion,
  SpreadsheetColumnMapping,
};

export interface ParseOptions {
  overrideFormat?: DocumentFormat;
  columnMapping?: SpreadsheetColumnMapping;
}

export function parseExtractedDocument(
  extracted: ExtractedDocument,
  options?: ParseOptions
): ParseDocumentResult {
  const detected = detectFormat(extracted);
  const formatToUse = options?.overrideFormat ?? detected.format;

  if (
    (formatToUse === "spreadsheet" || extracted.isSpreadsheet) &&
    extracted.headers &&
    extracted.rows
  ) {
    const mapping =
      options?.columnMapping ?? guessSpreadsheetMapping(extracted.headers);
    const questions = parseSpreadsheetRows(extracted.rows, mapping);
    return {
      detectedFormat: {
        format: "spreadsheet",
        confidence: detected.confidence,
      },
      questions,
      globalWarnings: [],
      spreadsheetHeaders: extracted.headers,
      spreadsheetMapping: mapping,
    };
  }

  const workingText = extracted.markedText ?? extracted.text;

  if (formatToUse === "qa_pairs" || formatToUse === "true_false" || formatToUse === "cloze") {
    const questions = parseQaDocument(workingText);
    return {
      detectedFormat: {
        format: formatToUse,
        confidence: detected.confidence,
      },
      questions,
      globalWarnings: [],
    };
  }

  const { questions, globalWarnings } = parseMcqDocument(workingText, {
    forceKeyTable: formatToUse === "mcq_with_key_table",
  });

  return {
    detectedFormat: {
      format: formatToUse,
      confidence: detected.confidence,
    },
    questions,
    globalWarnings,
  };
}

