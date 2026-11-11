import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { vi } from "@/lib/i18n/vi";
import { normalizeInlineWhitespace, normalizeText } from "@/lib/parsing/normalize";
import type { ExtractedDocument } from "@/lib/parsing/types";

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

  if (
    fileName.endsWith(".pdf") ||
    mimeType === "application/pdf" ||
    (input.buffer && isPdfBuffer(input.buffer))
  ) {
    throw new Error(vi.parsing.pdfNotSupported);
  }

  // Trường hợp dán văn bản trực tiếp
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

  // 1. File Word (.docx)
  if (
    fileName.endsWith(".docx") ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractFromDocx(input.buffer);
  }

  // 2. File Bảng tính (.xlsx, .csv)
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

  // 3. File văn bản thuần (.txt)
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

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF";
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
  const markedText = normalizeText(convertDocxHtmlToMarkedText(htmlResult.value));

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

  // Xử lý bảng HTML: gom các ô <td>/<th> trên cùng 1 hàng <tr> cách nhau bởi dấu tab
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

    // Kiểm tra xem chữ cái lựa chọn (A., B., C., D.) hoặc nội dung lựa chọn có được gạch chân / in đậm không
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

  // Nhóm các lựa chọn theo từng câu hỏi để chỉ gắn [[CORRECT]] khi chỉ 1 lựa chọn có gạch chân hoặc chỉ 1 lựa chọn có in đậm
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
  const matrix = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(
    sheet,
    {
      header: 1,
      defval: "",
      blankrows: false,
    }
  );

  if (matrix.length === 0) {
    throw new Error(vi.parsing.emptyContent);
  }

  // Tìm dòng tiêu đề (dòng đầu tiên có ít nhất 2 ô không rỗng)
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
