import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { vi } from "@/lib/i18n/vi";
import type {
  BuiltPrintExamPackage,
  BuiltPrintExamVersion,
  PrintExamHeaderInfo,
} from "./types";

const FONT_FAMILY = "Times New Roman";
// Trong thư viện docx, size tính theo half-point (24 = 12pt, 26 = 13pt, 28 = 14pt)
const SIZE_11PT = 22;
const SIZE_12PT = 24;
const SIZE_13PT = 26;
const SIZE_14PT = 28;

// Chuẩn khổ giấy A4 (đơn vị twip: 1 mm ≈ 56.6929 twip)
const A4_WIDTH_TWIP = 11906;
const A4_HEIGHT_TWIP = 16838;
const MARGIN_STD_TWIP = 1134; // ~ 2.0 cm

function run12(
  text: string,
  options?: { bold?: boolean; italics?: boolean; size?: number }
): TextRun {
  return new TextRun({
    text,
    font: FONT_FAMILY,
    size: options?.size ?? SIZE_12PT,
    bold: options?.bold ?? false,
    italics: options?.italics ?? false,
  });
}

function buildVersionHeaderBlock(
  header: PrintExamHeaderInfo,
  versionCode: string
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  const leftChildren: Paragraph[] = [];
  if (header.schoolName?.trim()) {
    leftChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          run12(header.schoolName.trim().toUpperCase(), {
            bold: true,
            size: SIZE_11PT,
          }),
        ],
      })
    );
  }
  leftChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        run12((header.examName || "ĐỀ KIỂM TRA").trim().toUpperCase(), {
          bold: true,
          size: SIZE_13PT,
        }),
      ],
    })
  );

  const metaParts: string[] = [];
  if (header.subject?.trim()) {
    metaParts.push(`${vi.printExam.subjectLabel}: ${header.subject.trim()}`);
  }
  if (header.className?.trim()) {
    metaParts.push(`${header.className.trim()}`);
  }
  if (metaParts.length > 0) {
    leftChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [run12(metaParts.join(" — "), { bold: true })],
      })
    );
  }

  if (header.durationMinutes && header.durationMinutes > 0) {
    leftChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [
          run12(
            `${vi.printExam.previewPage.durationPrefix} ${header.durationMinutes} ${vi.printExam.previewPage.minutesUnit}`,
            { italics: true }
          ),
        ],
      })
    );
  }

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 72, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
            children: leftChildren,
          }),
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
              bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
              left: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
              right: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 80, after: 40 },
                children: [
                  run12(
                    `${vi.printExam.previewPage.examCodeBoxPrefix} ${versionCode}`,
                    { bold: true, size: SIZE_14PT }
                  ),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 80 },
                children: [
                  run12(vi.printExam.previewPage.noMaterialsNotice, {
                    italics: true,
                    size: SIZE_11PT,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  elements.push(headerTable);

  const studentLine =
    header.studentInfoLine?.trim() || vi.printExam.studentInfoLineDefault;

  elements.push(
    new Paragraph({
      spacing: { before: 160, after: 160 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "333333" },
      },
      children: [run12(studentLine)],
    })
  );

  return elements;
}

function buildAnswerSheetTableForVersion(
  version: BuiltPrintExamVersion
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  out.push(
    new Paragraph({
      spacing: { before: 240, after: 80 },
      alignment: AlignmentType.CENTER,
      children: [
        run12(
          `${vi.printExam.previewPage.answerSheetTitle} — ${vi.printExam.previewPage.examCodeBoxPrefix} ${version.versionCode}`,
          { bold: true, size: SIZE_13PT }
        ),
      ],
    })
  );

  out.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        run12(vi.printExam.previewPage.answerSheetInstruction, {
          italics: true,
          size: SIZE_11PT,
        }),
      ],
    })
  );

  // Chia bảng phiếu trả lời thành 2 cột đôi cho gọn trang A4
  const totalQ = version.questions.length;
  const half = Math.ceil(totalQ / 2);
  const rows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 12, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                run12(vi.printExam.previewPage.answerSheetColQuestion, {
                  bold: true,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: 38, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                run12(vi.printExam.previewPage.answerSheetColAnswer, {
                  bold: true,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: 12, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                run12(vi.printExam.previewPage.answerSheetColQuestion, {
                  bold: true,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: 38, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                run12(vi.printExam.previewPage.answerSheetColAnswer, {
                  bold: true,
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ];

  function formatBubbleCellText(q: BuiltPrintExamVersion["questions"][number]): string {
    if (q.type === "mcq") {
      return q.choices.map((c) => `◯ ${c.label}`).join("     ");
    }
    if (q.type === "true_false") {
      return `◯ ${vi.printExam.previewPage.trueLabel}      ◯ ${vi.printExam.previewPage.falseLabel}`;
    }
    return "......................................................";
  }

  for (let i = 0; i < half; i += 1) {
    const leftQ = version.questions[i];
    const rightQ = version.questions[i + half];

    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run12(leftQ ? String(leftQ.displayNumber) : "", {
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run12(leftQ ? formatBubbleCellText(leftQ) : "")],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run12(rightQ ? String(rightQ.displayNumber) : "", {
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run12(rightQ ? formatBubbleCellText(rightQ) : "")],
              }),
            ],
          }),
        ],
      })
    );
  }

  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    })
  );

  return out;
}

function buildSingleVersionPaperElements(
  header: PrintExamHeaderInfo,
  version: BuiltPrintExamVersion,
  prependPageBreak: boolean
): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];

  if (prependPageBreak) {
    children.push(
      new Paragraph({
        children: [new PageBreak()],
      })
    );
  }

  children.push(...buildVersionHeaderBlock(header, version.versionCode));

  children.push(
    new Paragraph({
      spacing: { before: 120, after: 120 },
      children: [
        run12(vi.printExam.previewPage.sectionQuestionsTitle, { bold: true }),
      ],
    })
  );

  for (const q of version.questions) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [
          run12(
            `${vi.printExam.previewPage.questionPrefix} ${q.displayNumber} (${q.points} ${vi.printExam.previewPage.pointsSuffix}): `,
            { bold: true }
          ),
          run12(q.displayStem),
        ],
      })
    );

    if (q.type === "mcq") {
      for (const ch of q.choices) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 360 },
            children: [
              run12(`${ch.label}. `, { bold: true }),
              run12(ch.text),
            ],
          })
        );
      }
    } else if (q.type === "true_false") {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          indent: { left: 360 },
          children: [
            run12(`A. ${vi.printExam.previewPage.trueLabel}`, { bold: true }),
            run12("          "),
            run12(`B. ${vi.printExam.previewPage.falseLabel}`, { bold: true }),
          ],
        })
      );
    } else if (q.type === "short_answer") {
      for (let lineIdx = 0; lineIdx < q.shortAnswerLines; lineIdx += 1) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            indent: { left: 360 },
            children: [
              run12(
                "........................................................................................................................................"
              ),
            ],
          })
        );
      }
    }
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 160 },
      children: [
        run12(vi.printExam.previewPage.endOfPaperNotice, { bold: true }),
      ],
    })
  );

  children.push(...buildAnswerSheetTableForVersion(version));

  return children;
}

/**
 * Tạo file Word (.docx) chứa Đề thi + Phiếu trả lời (tất cả mã đề hoặc 1 mã đề được chọn).
 * Mỗi mã đề luôn bắt đầu ở một trang A4 mới.
 */
export async function generateExamPapersDocxBuffer(
  pkg: BuiltPrintExamPackage,
  targetVersionCode?: string | null
): Promise<Buffer> {
  const selectedVersions = targetVersionCode
    ? pkg.versions.filter((v) => v.versionCode === targetVersionCode)
    : pkg.versions;

  const versionsToRender =
    selectedVersions.length > 0 ? selectedVersions : pkg.versions;

  const children: (Paragraph | Table)[] = [];
  versionsToRender.forEach((ver, idx) => {
    children.push(
      ...buildSingleVersionPaperElements(pkg.header, ver, idx > 0)
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIP,
              height: A4_HEIGHT_TWIP,
            },
            margin: {
              top: MARGIN_STD_TWIP,
              right: MARGIN_STD_TWIP,
              bottom: MARGIN_STD_TWIP,
              left: MARGIN_STD_TWIP,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/**
 * Tạo file Word (.docx) RIÊNG cho Giáo viên: Đáp án, Biểu điểm từng mã đề & Bảng đối chiếu câu gốc ↔ mã đề
 */
export async function generateAnswerKeyAndCrossRefDocxBuffer(
  pkg: BuiltPrintExamPackage
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        run12(vi.printExam.previewPage.answerKeyMainTitle, {
          bold: true,
          size: SIZE_14PT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        run12(pkg.header.examName.toUpperCase(), {
          bold: true,
          size: SIZE_13PT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        run12(vi.printExam.previewPage.answerKeySubtitle, {
          italics: true,
          size: SIZE_11PT,
        }),
      ],
    })
  );

  // Phần 1: Đáp án từng mã đề
  for (const ver of pkg.versions) {
    children.push(
      new Paragraph({
        spacing: { before: 180, after: 80 },
        children: [
          run12(
            `■ ${vi.printExam.previewPage.examCodeBoxPrefix} ${ver.versionCode} (${pkg.totalPoints} ${vi.printExam.previewPage.pointsSuffix})`,
            { bold: true, size: SIZE_13PT }
          ),
        ],
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [
          run12(`${vi.printExam.previewPage.answerKeyQuickTableTitle} `, {
            bold: true,
          }),
          run12(ver.quickAnswerSummary),
        ],
      })
    );

    const detailQuestions = ver.questions.filter(
      (q) =>
        q.type === "cloze" ||
        q.type === "short_answer" ||
        Boolean(q.explanation)
    );

    if (detailQuestions.length > 0) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            run12(vi.printExam.previewPage.answerKeyDetailTitle, {
              bold: true,
              italics: true,
            }),
          ],
        })
      );

      for (const dq of detailQuestions) {
        const parts: TextRun[] = [
          run12(
            `• ${vi.printExam.previewPage.questionPrefix} ${dq.displayNumber} (${dq.points}đ): `,
            { bold: true }
          ),
          run12(dq.correctAnswerDisplay, { bold: true }),
        ];

        if (dq.acceptedVariants.length > 0) {
          parts.push(
            run12(
              ` (${vi.printExam.previewPage.acceptedVariantsPrefix} ${dq.acceptedVariants.join(", ")})`,
              { italics: true }
            )
          );
        }

        if (dq.explanation) {
          parts.push(
            run12(
              ` — ${vi.printExam.previewPage.explanationPrefix} ${dq.explanation}`
            )
          );
        }

        children.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 240 },
            children: parts,
          })
        );
      }
    }
  }

  // Phần 2: Bảng đối chiếu câu gốc ↔ Mã đề
  children.push(
    new Paragraph({
      children: [new PageBreak()],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 80 },
      children: [
        run12(vi.printExam.previewPage.crossRefTitle, {
          bold: true,
          size: SIZE_13PT,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        run12(vi.printExam.previewPage.crossRefSubtitle, {
          italics: true,
          size: SIZE_11PT,
        }),
      ],
    })
  );

  const headerCells: TableCell[] = [
    new TableCell({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            run12(vi.printExam.previewPage.crossRefOriginalCol, { bold: true }),
          ],
        }),
      ],
    }),
    new TableCell({
      children: [
        new Paragraph({
          children: [
            run12(vi.printExam.previewPage.crossRefStemCol, { bold: true }),
          ],
        }),
      ],
    }),
    ...pkg.versions.map(
      (ver) =>
        new TableCell({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                run12(
                  `${vi.printExam.previewPage.crossRefVersionColPrefix} ${ver.versionCode}`,
                  { bold: true }
                ),
              ],
            }),
          ],
        })
    ),
  ];

  const crossRefRows: TableRow[] = [
    new TableRow({
      children: headerCells,
    }),
  ];

  for (const row of pkg.crossReference) {
    crossRefRows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run12(`#${row.originalNumber}`, { bold: true })],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [run12(row.stemPreview, { size: SIZE_11PT })],
              }),
            ],
          }),
          ...pkg.versions.map((ver) => {
            const cell = row.byVersion[ver.versionCode];
            const text = cell
              ? `${vi.printExam.previewPage.questionPrefix} ${cell.displayNumber} (${cell.correctAnswerDisplay})`
              : "-";
            return new TableCell({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [run12(text, { size: SIZE_11PT })],
                }),
              ],
            });
          }),
        ],
      })
    );
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: crossRefRows,
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIP,
              height: A4_HEIGHT_TWIP,
            },
            margin: {
              top: MARGIN_STD_TWIP,
              right: MARGIN_STD_TWIP,
              bottom: MARGIN_STD_TWIP,
              left: MARGIN_STD_TWIP,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

