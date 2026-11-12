import { describe, expect, it } from "vitest";
import { buildPrintExamPackage, formatClozeStemForPrint } from "@/lib/export";
import {
  generateAnswerKeyAndCrossRefDocxBuffer,
  generateExamPapersDocxBuffer,
} from "@/lib/export/docx-builder";
import type { ExamQuestionWithSnapshot } from "@/lib/grading/types";

function createSample100Questions(): ExamQuestionWithSnapshot[] {
  const list: ExamQuestionWithSnapshot[] = [];

  for (let i = 1; i <= 100; i += 1) {
    const eqId = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const qId = `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`;

    if (i % 10 === 0) {
      list.push({
        examQuestionId: eqId,
        questionId: qId,
        points: 0.1,
        position: i,
        snapshot: {
          id: qId,
          type: "cloze",
          stem: `Câu điền khuyết số ${i}: Giao thức [[HTTPS]] sử dụng cổng mặc định là 443.`,
          choices: [],
          answer_text: "HTTPS",
          accepted_variants: ["https"],
          explanation: `Giải thích câu ${i}`,
          topic: "Mạng máy tính",
          difficulty: "medium",
        },
      });
    } else if (i % 15 === 0) {
      list.push({
        examQuestionId: eqId,
        questionId: qId,
        points: 0.1,
        position: i,
        snapshot: {
          id: qId,
          type: "true_false",
          stem: `Câu đúng sai số ${i}: Bộ nhớ RAM là bộ nhớ khả biến.`,
          choices: [
            { id: `${eqId}-T`, text: "Đúng", is_correct: true, position: 0 },
            { id: `${eqId}-F`, text: "Sai", is_correct: false, position: 1 },
          ],
          answer_text: "Đúng",
          accepted_variants: [],
          explanation: null,
          topic: "Phần cứng",
          difficulty: "easy",
        },
      });
    } else {
      const correctIdx = i % 4; // 0..3
      list.push({
        examQuestionId: eqId,
        questionId: qId,
        points: 0.1,
        position: i,
        snapshot: {
          id: qId,
          type: "mcq",
          stem: `Câu hỏi trắc nghiệm tiếng Việt số ${i}: Đâu là đáp án đúng của câu ${i}?`,
          choices: [
            {
              id: `${eqId}-c0`,
              text: `Phương án gốc 0 của câu ${i}`,
              is_correct: correctIdx === 0,
              position: 0,
            },
            {
              id: `${eqId}-c1`,
              text: `Phương án gốc 1 của câu ${i}`,
              is_correct: correctIdx === 1,
              position: 1,
            },
            {
              id: `${eqId}-c2`,
              text: `Phương án gốc 2 của câu ${i}`,
              is_correct: correctIdx === 2,
              position: 2,
            },
            {
              id: `${eqId}-c3`,
              text: `Phương án gốc 3 của câu ${i}`,
              is_correct: correctIdx === 3,
              position: 3,
            },
          ],
          answer_text: null,
          accepted_variants: [],
          explanation: `Giải thích chi tiết cho câu ${i}`,
          topic: "Kiến thức chung",
          difficulty: "medium",
        },
      });
    }
  }

  return list;
}

describe("Print Exam Multi-Version & DOCX Export Suite (Bước 7)", () => {
  it("1. Trộn xác định theo seed: cùng cấu hình & seed luôn sinh 4 mã đề (101..104) giống hệt nhau", () => {
    const questions = createSample100Questions();
    const pkg1 = buildPrintExamPackage({
      header: {
        schoolName: "TRƯỜNG THPT CHU VĂN AN",
        examName: "ĐỀ KIỂM TRA HỌC KỲ I",
        subject: "Tin học 12",
        className: "Khối 12",
        durationMinutes: 45,
      },
      questions,
      versionCount: 4,
      seed: "seed-hoc-ky-1-2026",
      shuffleQuestions: true,
      shuffleChoices: true,
    });

    const pkg2 = buildPrintExamPackage({
      header: {
        schoolName: "TRƯỜNG THPT CHU VĂN AN",
        examName: "ĐỀ KIỂM TRA HỌC KỲ I",
        subject: "Tin học 12",
        className: "Khối 12",
        durationMinutes: 45,
      },
      questions,
      versionCount: 4,
      seed: "seed-hoc-ky-1-2026",
      shuffleQuestions: true,
      shuffleChoices: true,
    });

    expect(pkg1.versions.map((v) => v.versionCode)).toEqual([
      "101",
      "102",
      "103",
      "104",
    ]);
    expect(pkg1.versions).toEqual(pkg2.versions);
    expect(pkg1.crossReference).toEqual(pkg2.crossReference);
  });

  it("2. Các mã đề có cùng tập 100 câu, đánh số lại 1..100 đúng, và thứ tự giữa 101 với 103 khác nhau", () => {
    const questions = createSample100Questions();
    const pkg = buildPrintExamPackage({
      header: { examName: "KIỂM TRA 100 CÂU" },
      questions,
      versionCount: 4,
      seed: "benchmark-100",
      shuffleQuestions: true,
      shuffleChoices: true,
    });

    const originalIdSet = new Set(questions.map((q) => q.examQuestionId));

    for (const ver of pkg.versions) {
      expect(ver.questions).toHaveLength(100);
      // Đánh số lại đúng 1..100
      expect(ver.questions.map((q) => q.displayNumber)).toEqual(
        Array.from({ length: 100 }, (_, idx) => idx + 1)
      );
      // Tập câu hỏi bảo toàn đủ 100%
      const verIdSet = new Set(ver.questions.map((q) => q.examQuestionId));
      expect(verIdSet).toEqual(originalIdSet);
    }

    expect(pkg.versions[0]!.questionOrder).not.toEqual(
      pkg.versions[2]!.questionOrder
    );
  });

  it("3. Đối chiếu 5 câu bất kỳ trong mã đề 103 với câu gốc: đáp án A/B/C/D khớp chính xác phương án đúng gốc", () => {
    const questions = createSample100Questions();
    const originalById = new Map(questions.map((q) => [q.examQuestionId, q]));

    const pkg = buildPrintExamPackage({
      header: { examName: "ĐỐI CHIẾU MÃ 103" },
      questions,
      versionCount: 4,
      seed: "verify-103-seed",
      shuffleQuestions: true,
      shuffleChoices: true,
    });

    const ver103 = pkg.versions.find((v) => v.versionCode === "103");
    expect(ver103).toBeDefined();

    // Lấy 5 vị trí ngẫu nhiên trong mã đề 103 (câu 7, 23, 48, 71, 94)
    const sampleDisplayNumbers = [7, 23, 48, 71, 94];
    for (const dispNum of sampleDisplayNumbers) {
      const vq = ver103!.questions[dispNum - 1]!;
      expect(vq.displayNumber).toBe(dispNum);

      const orig = originalById.get(vq.examQuestionId)!;
      expect(orig).toBeDefined();

      if (orig.snapshot.type === "mcq") {
        const origCorrectChoice = orig.snapshot.choices.find(
          (c) => c.is_correct
        )!;
        const selectedByKey = vq.choices.find(
          (c) => c.label === vq.correctAnswerDisplay
        )!;
        expect(selectedByKey).toBeDefined();
        expect(selectedByKey.choiceId).toBe(origCorrectChoice.id);
        expect(selectedByKey.text).toBe(origCorrectChoice.text);
        expect(selectedByKey.isCorrect).toBe(true);
      } else {
        expect(vq.correctAnswerDisplay).toBe(orig.snapshot.answer_text);
      }

      // Kiểm tra bảng đối chiếu (crossReference) tại câu gốc tương ứng
      const crossRow = pkg.crossReference.find(
        (r) => r.examQuestionId === vq.examQuestionId
      )!;
      expect(crossRow.originalNumber).toBe(vq.originalNumber);
      expect(crossRow.byVersion["103"]).toEqual({
        versionCode: "103",
        displayNumber: dispNum,
        correctAnswerDisplay: vq.correctAnswerDisplay,
      });
    }
  });

  it("4. Định dạng câu điền khuyết (cloze) thay thế chỗ trống thành dòng kẻ in", () => {
    expect(
      formatClozeStemForPrint("Thủ đô của Việt Nam là [[Hà Nội]].")
    ).toBe("Thủ đô của Việt Nam là ____________________.");
  });

  it("5. Tạo thành công 2 file Word (.docx) chuẩn A4 (Đề thi 4 mã đề & Đáp án riêng) từ bộ 100 câu", async () => {
    const questions = createSample100Questions();
    const pkg = buildPrintExamPackage({
      header: {
        schoolName: "TRƯỜNG THPT CHUYÊN",
        examName: "ĐỀ THI THỬ 100 CÂU",
        subject: "Tin học",
        className: "Lớp 12A1",
        durationMinutes: 60,
      },
      questions,
      versionCount: 4,
      seed: "docx-100-seed",
      shuffleQuestions: true,
      shuffleChoices: true,
    });

    const allPapersBuf = await generateExamPapersDocxBuffer(pkg);
    const single103Buf = await generateExamPapersDocxBuffer(pkg, "103");
    const answerKeyBuf = await generateAnswerKeyAndCrossRefDocxBuffer(pkg);

    // Kiểm tra chữ ký ZIP chuẩn của file .docx ("PK\x03\x04")
    expect(allPapersBuf.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(single103Buf.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(answerKeyBuf.subarray(0, 2).toString("utf8")).toBe("PK");

    // File chứa tất cả 4 mã đề lớn hơn file chỉ chứa 1 mã đề 103
    expect(allPapersBuf.byteLength).toBeGreaterThan(single103Buf.byteLength);
    expect(answerKeyBuf.byteLength).toBeGreaterThan(2000);
  });
});
