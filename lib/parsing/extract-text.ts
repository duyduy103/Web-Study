import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { vi } from "@/lib/i18n/vi";
import { normalizeInlineWhitespace, normalizeText } from "@/lib/parsing/normalize";
import type { ExtractedDocument } from "@/lib/parsing/types";

export const MAX_PDF_PAGES = 60;

export interface ExtractInput {
  buffer?: Buffer;
  text?: string;
  fileName?: string;
  mimeType?: string;
}

export async function extractText(
  input: ExtractInput
): Promise<ExtractedDocument> {
  const fileName = (input.fileName ?? "").toLowerCase();
  const mimeType = (input.mimeType ?? "").toLowerCase();

  // 1. Kiểm tra file PDF (bao gồm cả PDF có chữ và PDF scan)
  if (
    fileName.endsWith(".pdf") ||
    mimeType === "application/pdf" ||
    (input.buffer && isPdfBuffer(input.buffer))
  ) {
    if (!input.buffer || input.buffer.length === 0) {
      throw new Error(vi.parsing.emptyContent);
    }

    const pageCount = countPdfPages(input.buffer);
    if (pageCount > MAX_PDF_PAGES) {
      throw new Error(
        `${vi.parsing.pdfTooManyPagesPrefix} ${pageCount} ${vi.parsing.pdfTooManyPagesSuffix}`
      );
    }

    return {
      text: "",
      markedText: "",
      isSpreadsheet: false,
      isMultimodal: true,
      mimeType: "application/pdf",
      pageCount,
    };
  }

  // 2. Kiểm tra file Ảnh (.png, .jpg, .jpeg)
  if (
    fileName.endsWith(".png") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    (input.buffer && (isPngBuffer(input.buffer) || isJpegBuffer(input.buffer)))
  ) {
    if (!input.buffer || input.buffer.length === 0) {
      throw new Error(vi.parsing.emptyContent);
    }

    const detectedMime =
      fileName.endsWith(".png") ||
      mimeType === "image/png" ||
      isPngBuffer(input.buffer)
        ? "image/png"
        : "image/jpeg";

    return {
      text: "",
      markedText: "",
      isSpreadsheet: false,
      isMultimodal: true,
      mimeType: detectedMime,
      pageCount: 1,
    };
  }

  // 3. Trường hợp dán văn bản trực tiếp
  if (typeof input.text === "string" && !input.buffer) {
    const cleaned = normalizeText(input.text);
    return {
      text: cleaned,
      markedText: cleaned,
      isSpreadsheet: false,
    };
  }

  if (!input.buffer) {
    throw new Error(vi.parsing.emptyContent);
  }

  // 4. File Word (.docx)
  if (
    fileName.endsWith(".docx") ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractFromDocx(input.buffer);
  }

  // 5. File Bảng tính (.xlsx, .csv)
  if (
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".csv") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv" ||
    mimeType === "application/csv"
  ) {
    const isCsv =
      fileName.endsWith(".csv") ||
      mimeType === "text/csv" ||
      mimeType === "application/csv";
    return extractFromSpreadsheet(input.buffer, isCsv);
  }

  // 6. File văn bản thuần (.txt)
  if (fileName.endsWith(".txt") || mimeType === "text/plain" || !fileName) {
    const raw = input.buffer.toString("utf-8");
    const cleaned = normalizeText(raw);
    return {
      text: cleaned,
      markedText: cleaned,
      isSpreadsheet: false,
    };
  }

  throw new Error(vi.parsing.unsupportedFileType);
}

export function isPdfBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF"
  );
}

export function isPngBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

export function isJpegBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

/**
 * Đếm số trang của file PDF từ cấu trúc từ điển trang (/Type /Page, không tính /Pages).
 */
export function countPdfPages(buffer: Buffer): number {
  const latin1 = buffer.toString("latin1");
  const matches = latin1.match(/\/Type\s*\/Page\b(?!s)/g);
  if (matches && matches.length > 0) {
    return matches.length;
  }
  return 1;
}

async function extractFromDocx(buffer: Buffer): Promise<ExtractedDocument> {
  const [rawResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml(
      { buffer },
      {
        styleMap: ["u => u", "b => strong"],
      }
    ),
  ]);

  const plainText = normalizeText(rawResult.value);
  const markedText = normalizeText(
    convertDocxHtmlToMarkedText(htmlResult.value)
  );

  return {
    text: plainText,
    markedText: markedText || plainText,
    isSpreadsheet: false,
  };
}

function convertDocxHtmlToMarkedText(html: string): string {
  if (!html) {
    return "";
  }

  const withTablesProcessed = html.replace(
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi,
    (_match, rowInner: string) => {
      const cells: string[] = [];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      for (const cellMatch of rowInner.matchAll(cellRegex)) {
        const cellContent = stripHtmlTags(decodeHtmlEntities(cellMatch[1]));
        cells.push(normalizeInlineWhitespace(cellContent));
      }
      return `<p>${cells.join("\t")}</p>\n`;
    }
  );

  const blockRegex = /<(?:p|li|h[1-6])[^>]*>([\s\S]*?)<\/(?:p|li|h[1-6])>/gi;
  const rawLines: Array<{
    text: string;
    hasUnderlineChoice: boolean;
    hasBoldChoice: boolean;
    isChoiceLine: boolean;
    isQuestionStart: boolean;
  }> = [];

  for (const match of withTablesProcessed.matchAll(blockRegex)) {
    const innerHtml = match[1];
    const decodedText = normalizeInlineWhitespace(
      stripHtmlTags(decodeHtmlEntities(innerHtml))
    );
    if (!decodedText) {
      continue;
    }

    const isChoiceLine =
      /^(?:[*✓✔]|\([xX]\)|\[[xX]\])?\s*[A-Da-d]\s*[.)]\s+/.test(decodedText);
    const isQuestionStart =
      /^(?:(?:Câu(?:\s*hỏi)?|Question|Bài)\s*\d+|\d+\s*[.)]\s+)/i.test(
        decodedText
      );

    const hasUnderlineChoice =
      isChoiceLine && /<u\b[^>]*>[\s\S]*?<\/u>/i.test(innerHtml);
    const hasBoldChoice =
      isChoiceLine && /<strong\b[^>]*>[\s\S]*?<\/strong>/i.test(innerHtml);

    rawLines.push({
      text: decodedText,
      hasUnderlineChoice,
      hasBoldChoice,
      isChoiceLine,
      isQuestionStart,
    });
  }

  let idx = 0;
  while (idx < rawLines.length) {
    if (!rawLines[idx].isChoiceLine) {
      idx++;
      continue;
    }

    const choiceIndices: number[] = [];
    while (idx < rawLines.length && !rawLines[idx].isQuestionStart) {
      if (rawLines[idx].isChoiceLine) {
        choiceIndices.push(idx);
      }
      idx++;
    }

    const underlined = choiceIndices.filter(
      (ci) => rawLines[ci].hasUnderlineChoice
    );
    const bolded = choiceIndices.filter((ci) => rawLines[ci].hasBoldChoice);

    if (underlined.length === 1) {
      rawLines[underlined[0]].text = `[[CORRECT]] ${rawLines[underlined[0]].text}`;
    } else if (bolded.length === 1 && choiceIndices.length >= 2) {
      rawLines[bolded[0]].text = `[[CORRECT]] ${rawLines[bolded[0]].text}`;
    }
  }

  return rawLines.map((l) => l.text).join("\n");
}

function stripHtmlTags(input: string): string {
  return input.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

function extractFromSpreadsheet(
  buffer: Buffer,
  isCsv = false
): ExtractedDocument {
  const workbook = isCsv
    ? XLSX.read(buffer.toString("utf-8").replace(/^\uFEFF/, ""), {
        type: "string",
      })
    : XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error(vi.parsing.emptyContent);
  }

  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<
    Array<string | number | boolean | null>
  >(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (matrix.length === 0) {
    throw new Error(vi.parsing.emptyContent);
  }

  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(matrix.length, 5); i++) {
    const nonEmptyCount = (matrix[i] ?? []).filter(
      (cell) => String(cell ?? "").trim().length > 0
    ).length;
    if (nonEmptyCount >= 2) {
      headerRowIdx = i;
      break;
    }
  }

  const rawHeaders = matrix[headerRowIdx] ?? [];
  const headers: string[] = rawHeaders.map((cell, idx) => {
    const label = normalizeInlineWhitespace(String(cell ?? ""));
    return label || `Cột ${idx + 1}`;
  });

  const rows: Record<string, string>[] = [];
  const textLines: string[] = [headers.join("\t")];

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rowCells = matrix[r] ?? [];
    const record: Record<string, string> = {};
    let hasContent = false;

    headers.forEach((headerName, colIdx) => {
      const val = normalizeInlineWhitespace(String(rowCells[colIdx] ?? ""));
      if (val.length > 0) {
        hasContent = true;
      }
      record[headerName] = val;
    });

    if (hasContent) {
      rows.push(record);
      textLines.push(headers.map((h) => record[h] ?? "").join("\t"));
    }
  }

  const joinedText = textLines.join("\n");

  return {
    text: joinedText,
    markedText: joinedText,
    isSpreadsheet: true,
    headers,
    rows,
  };
}
