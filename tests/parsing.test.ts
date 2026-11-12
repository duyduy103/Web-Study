import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  extractText,
  detectFormat,
  parseExtractedDocument,
  normalizeText,
  type ParsedQuestion,
} from "@/lib/parsing";
import { vi } from "@/lib/i18n/vi";

const SAMPLES_DIR = path.resolve(process.cwd(), "samples");

interface SampleReportRow {
  file: string;
  format: string;
  total: number;
  high: number;
  medium: number;
  low: number;
  accuracyOrFlagRate: string;
}

function summarizeConfidence(questions: ParsedQuestion[]) {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const q of questions) {
    if (q.confidence >= 0.8) {
      high++;
    } else if (q.confidence >= 0.5) {
      medium++;
    } else {
      low++;
    }
  }
  return { high, medium, low };
}

describe("MemoQuiz Rule-based Parsing Suite", () => {
  it("1. Đọc và tách chính xác các file mẫu thật trong /samples, in báo cáo tổng hợp", async () => {
    const sampleFiles = fs
      .readdirSync(SAMPLES_DIR)
      .filter((f) => /\.(docx|xlsx|csv|txt)$/i.test(f))
      .sort();

    expect(sampleFiles.length).toBeGreaterThanOrEqual(5);

    const reports: SampleReportRow[] = [];

    for (const fileName of sampleFiles) {
      const fullPath = path.join(SAMPLES_DIR, fileName);
      const buffer = fs.readFileSync(fullPath);

      const extracted = await extractText({
        buffer,
        fileName,
      });

      const result = parseExtractedDocument(extracted);
      const { high, medium, low } = summarizeConfidence(result.questions);

      // Kiểm tra mọi câu hỏi trong 5 file mẫu đều tách được đúng đáp án
      const validAnsweredCount = result.questions.filter((q) => {
        if (q.type === "mcq" || q.type === "true_false") {
          return (
            (q.choices?.length ?? 0) >= 2 &&
            q.choices?.filter((c) => c.isCorrect).length === 1
          );
        }
        return Boolean(q.answerText && q.answerText.length > 0);
      }).length;

      reports.push({
        file: fileName,
        format: result.detectedFormat.format,
        total: result.questions.length,
        high,
        medium,
        low,
        accuracyOrFlagRate: `${validAnsweredCount}/${result.questions.length} (${Math.round(
          (validAnsweredCount / Math.max(1, result.questions.length)) * 100
        )}%)`,
      });

      console.log(
        `\n=== [${fileName}] | Định dạng: ${result.detectedFormat.format} | Tổng: ${result.questions.length} câu (Cao: ${high}, TB: ${medium}, Thấp: ${low}) ===`
      );
      result.questions.forEach((q, idx) => {
        const ansDisplay =
          q.choices
            ?.filter((c) => c.isCorrect)
            .map((c) => c.text)
            .join(", ") ??
          q.answerText ??
          "(Trống)";
        console.log(
          `  #${idx + 1} [${q.type}] (conf=${q.confidence}): "${q.stem.slice(0, 55)}..." -> ĐA: "${ansDisplay.slice(0, 35)}" | warnings=${JSON.stringify(q.warnings)}`
        );
      });
    }

    console.table(reports);

    for (const r of reports) {
      expect(r.total).toBeGreaterThan(0);
      if (!r.file.includes("lon_xon")) {
        expect(r.high / r.total).toBeGreaterThanOrEqual(0.95);
      } else {
        // File lộn xộn: các câu không chuẩn phải có cảnh báo và hạ độ tin cậy
        expect(r.medium + r.low).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("2. Nhận diện file PDF/Ảnh là tài liệu đa phương thức (isMultimodal) và chặn PDF vượt quá 60 trang", async () => {
    const validPdfBuffer = Buffer.from(
      "%PDF-1.5\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Page >> endobj",
      "utf-8"
    );
    const pdfExtracted = await extractText({
      buffer: validPdfBuffer,
      fileName: "de_cuong_lich_su.pdf",
      mimeType: "application/pdf",
    });
    expect(pdfExtracted.isMultimodal).toBe(true);
    expect(pdfExtracted.mimeType).toBe("application/pdf");
    expect(pdfExtracted.pageCount).toBe(2);

    // File PDF có 65 trang (> 60 trang tối đa) -> từ chối
    const pages65 = Array.from(
      { length: 65 },
      (_, idx) => `${idx + 1} 0 obj << /Type /Page >> endobj`
    ).join("\n");
    const hugePdfBuffer = Buffer.from(`%PDF-1.5\n${pages65}`, "utf-8");

    await expect(
      extractText({
        buffer: hugePdfBuffer,
        fileName: "de_cuong_65_trang.pdf",
        mimeType: "application/pdf",
      })
    ).rejects.toThrow(vi.parsing.pdfTooManyPagesPrefix);
  });

  it("3. Xử lý trường hợp biên: câu thiếu đáp án, đánh số nhảy cách, lựa chọn nhiều dòng", async () => {
    const rawText = `
      Câu 1: Thủ đô của nước Cộng hòa Xã hội Chủ nghĩa Việt Nam là thành phố nào?
      A. Thành phố Đà Nẵng
      trực thuộc trung ương
      *B. Thành phố Hà Nội
      ngàn năm văn hiến
      C. Thành phố Huế
      D. Thành phố Hồ Chí Minh

      Câu 3: Sông nào dài nhất trên thế giới hiện nay?
      A. Sông Mê Kông
      B. Sông Nin
      C. Sông Hồng
      D. Sông Đà

      Câu 4: Câu hỏi chỉ có 2 lựa chọn?
      *A. Lựa chọn thứ nhất
      B. Lựa chọn thứ hai
    `;

    const extracted = await extractText({ text: rawText });
    const parsed = parseExtractedDocument(extracted);

    expect(parsed.questions).toHaveLength(3);

    // Câu 1: lựa chọn nhiều dòng được ghép đầy đủ, có dấu * ở đáp án B -> tin cậy cao
    const q1 = parsed.questions[0];
    expect(q1.confidence).toBeGreaterThanOrEqual(0.9);
    expect(q1.choices?.[1].text).toContain("Thành phố Hà Nội ngàn năm văn hiến");
    expect(q1.choices?.[1].isCorrect).toBe(true);

    // Câu 3: nhảy số từ 1 sang 3 + thiếu đáp án đúng -> tin cậy thấp (đỏ) và có đủ 2 cảnh báo
    const q2 = parsed.questions[1];
    expect(q2.confidence).toBeLessThan(0.5);
    expect(q2.warnings).toContain(vi.parsing.warnings.missingAnswer);
    expect(
      q2.warnings.some((w) =>
        w.startsWith(vi.parsing.warnings.skippedNumberPrefix)
      )
    ).toBe(true);

    // Câu 4: chỉ có 2 lựa chọn -> hạ xuống mức trung bình (vàng) kèm cảnh báo
    const q3 = parsed.questions[2];
    expect(q3.confidence).toBeLessThan(0.8);
    expect(q3.warnings).toContain(vi.parsing.warnings.onlyTwoChoicesMcq);
  });

  it("4. Xử lý trường hợp biên: bảng đáp án cuối đề bị lệch số lượng so với số câu hỏi", async () => {
    const rawText = `
      Câu 1. Nước sôi ở bao nhiêu độ C trong điều kiện tiêu chuẩn?
      A. 50 độ C
      B. 100 độ C
      C. 80 độ C
      D. 120 độ C

      Câu 2. Kim loại nào dẫn điện tốt nhất?
      A. Sắt
      B. Đồng
      C. Bạc
      D. Nhôm

      Câu 3. Công thức hóa học của nước là gì?
      A. CO2
      B. H2O
      C. O2
      D. NaCl

      BẢNG ĐÁP ÁN
      1-B  2-C
    `;

    const extracted = await extractText({ text: rawText });
    const result = parseExtractedDocument(extracted);

    expect(result.detectedFormat.format).toBe("mcq_with_key_table");
    expect(result.questions).toHaveLength(3);
    expect(result.globalWarnings.length).toBeGreaterThan(0);
    expect(result.globalWarnings[0]).toContain(
      vi.parsing.warnings.answerKeyCountMismatchPrefix
    );

    // Câu 1 và 2 có đáp án trong bảng -> tin cậy cao
    expect(result.questions[0].confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.questions[1].confidence).toBeGreaterThanOrEqual(0.9);

    // Câu 3 thiếu đáp án trong bảng -> tin cậy thấp kèm cảnh báo thiếu đáp án
    expect(result.questions[2].confidence).toBeLessThan(0.5);
    expect(result.questions[2].warnings).toContain(
      vi.parsing.warnings.missingAnswer
    );
  });

  it("5. Nhận diện và tách câu hỏi Đúng/Sai (true_false) và Điền khuyết (cloze)", async () => {
    const tfText = `
      Câu 1: Trái Đất quay quanh Mặt Trời.
      Đáp án: Đúng

      Câu 2: Mặt Trời mọc ở hướng Tây.
      Đáp án: Sai
    `;

    const tfExtracted = await extractText({ text: tfText });
    const tfDetected = detectFormat(tfExtracted);
    expect(tfDetected.format).toBe("true_false");

    const tfParsed = parseExtractedDocument(tfExtracted);
    expect(tfParsed.questions).toHaveLength(2);
    expect(tfParsed.questions[0].type).toBe("true_false");
    expect(tfParsed.questions[0].choices?.[0]).toEqual({
      text: "Đúng",
      isCorrect: true,
    });
    expect(tfParsed.questions[1].choices?.[1]).toEqual({
      text: "Sai",
      isCorrect: true,
    });

    const clozeText = `
      Câu 1: Chiến thắng Điện Biên Phủ diễn ra vào năm ____.
      Đáp án: 1954

      Câu 2: Bác Hồ đọc Bản Tuyên ngôn Độc lập tại quảng trường ____.
      Đáp án: Ba Đình
    `;

    const clozeExtracted = await extractText({ text: clozeText });
    const clozeDetected = detectFormat(clozeExtracted);
    expect(clozeDetected.format).toBe("cloze");

    const clozeParsed = parseExtractedDocument(clozeExtracted);
    expect(clozeParsed.questions).toHaveLength(2);
    expect(clozeParsed.questions[0].type).toBe("cloze");
    expect(clozeParsed.questions[0].answerText).toBe("1954");
  });

  it("6. Chuẩn hóa Unicode NFC cho tiếng Việt tổ hợp và khoảng trắng thừa", () => {
    // Chuỗi dùng dấu tổ hợp (NFD): "Tiê\u0301ng Viê\u0323t"
    const decomposed = "  Ti\u0065\u0302\u0301ng   Vi\u0065\u0302\u0323t  \r\n\r\n\r\n  Chu\u0061\u0302\u0309n   ";
    const normalized = normalizeText(decomposed);
    expect(normalized).toBe("Tiếng   Việt\n\nChuẩn");
    expect(normalized).toBe(normalized.normalize("NFC"));
  });
});
