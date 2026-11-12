export interface ExamAttemptCsvRow {
  studentName: string;
  studentClass: string | null;
  score: number | null;
  totalPoints: number;
  status: "in_progress" | "submitted" | "expired";
  needsManualReview: boolean;
  durationSeconds: number | null;
  startedAt: string;
  submittedAt: string | null;
}

function escapeCsvCell(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Tạo nội dung file CSV bảng điểm (kèm UTF-8 BOM để mở trực tiếp bằng Excel hiển thị chuẩn tiếng Việt)
 */
export function generateExamAttemptsCsv(rows: readonly ExamAttemptCsvRow[]): string {
  const headers = [
    "STT",
    "Họ và tên",
    "Lớp",
    "Điểm số",
    "Thang điểm",
    "Loại điểm",
    "Trạng thái",
    "Thời gian làm (giây)",
    "Bắt đầu lúc",
    "Nộp lúc",
  ];

  const lines: string[] = [headers.map(escapeCsvCell).join(",")];

  rows.forEach((row, index) => {
    const statusText =
      row.status === "submitted"
        ? "Đã nộp"
        : row.status === "expired"
          ? "Hết giờ (Tự nộp)"
          : "Đang làm";
    const scoreType = row.needsManualReview ? "Điểm tạm tính" : "Chính thức";

    const cells = [
      String(index + 1),
      row.studentName,
      row.studentClass ?? "",
      row.score !== null ? String(row.score) : "",
      String(row.totalPoints),
      scoreType,
      statusText,
      row.durationSeconds !== null ? String(row.durationSeconds) : "",
      row.startedAt ? new Date(row.startedAt).toLocaleString("vi-VN") : "",
      row.submittedAt ? new Date(row.submittedAt).toLocaleString("vi-VN") : "",
    ];

    lines.push(cells.map(escapeCsvCell).join(","));
  });

  return `\uFEFF${lines.join("\r\n")}`;
}

// ============================================================================
// BỘ SINH MÃ QR CHUẨN ISO/IEC 18004 (Byte Mode, ECC Level L, Version 1..4)
// Tự viết 100% bằng TypeScript thuần để không cài thêm thư viện ngoài
// ============================================================================

interface QrVersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewords: number;
  alignmentCenters: number[];
}

const QR_VERSIONS_L: readonly QrVersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, ecCodewords: 7, alignmentCenters: [] },
  { version: 2, size: 25, dataCodewords: 34, ecCodewords: 10, alignmentCenters: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, alignmentCenters: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, alignmentCenters: [6, 26] },
];

function gfMultiply(x: number, y: number): number {
  let result = 0;
  let a = x;
  let b = y;
  while (b > 0) {
    if (b & 1) result ^= a;
    b >>= 1;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
  }
  return result;
}

function computeReedSolomonEc(data: readonly number[], ecCount: number): number[] {
  let gen = [1];
  for (let i = 0; i < ecCount; i += 1) {
    let factor = 1;
    for (let k = 0; k < i; k += 1) {
      factor = gfMultiply(factor, 2);
    }
    const nextGen = new Array<number>(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j += 1) {
      nextGen[j] = (nextGen[j] ?? 0) ^ (gen[j] ?? 0);
      nextGen[j + 1] = (nextGen[j + 1] ?? 0) ^ gfMultiply(gen[j] ?? 0, factor);
    }
    gen = nextGen;
  }

  const remainder = new Array<number>(ecCount).fill(0);
  for (const byte of data) {
    const lead = byte ^ (remainder[0] ?? 0);
    remainder.shift();
    remainder.push(0);
    for (let j = 0; j < ecCount; j += 1) {
      remainder[j] = (remainder[j] ?? 0) ^ gfMultiply(gen[j + 1] ?? 0, lead);
    }
  }
  return remainder;
}

function appendBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
}

function placeFinderPattern(
  modules: boolean[][],
  isFunction: boolean[][],
  row: number,
  col: number,
  size: number
): void {
  for (let dr = -1; dr <= 7; dr += 1) {
    for (let dc = -1; dc <= 7; dc += 1) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
      const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      modules[r]![c] = inOuter && (onBorder || inInner);
      isFunction[r]![c] = true;
    }
  }
}

function placeAlignmentPattern(
  modules: boolean[][],
  isFunction: boolean[][],
  centerRow: number,
  centerCol: number
): void {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      const r = centerRow + dr;
      const c = centerCol + dc;
      modules[r]![c] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
      isFunction[r]![c] = true;
    }
  }
}

/**
 * Sinh ma trận điểm đen/trắng của mã QR cho văn bản đầu vào (tối đa ~78 byte UTF-8)
 */
export function buildQrMatrix(text: string): boolean[][] {
  const utf8Bytes = Array.from(new TextEncoder().encode(text));
  const spec =
    QR_VERSIONS_L.find((v) => utf8Bytes.length + 2 <= v.dataCodewords) ??
    QR_VERSIONS_L[QR_VERSIONS_L.length - 1]!;

  const payloadBytes = utf8Bytes.slice(0, spec.dataCodewords - 2);
  const bits: number[] = [];

  // Mode indicator: Byte mode (0100)
  appendBits(bits, 0b0100, 4);
  appendBits(bits, payloadBytes.length, 8);
  for (const b of payloadBytes) {
    appendBits(bits, b, 8);
  }

  const capacityBits = spec.dataCodewords * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < capacityBits) {
    appendBits(bits, padBytes[padIdx % 2]!, 8);
    padIdx += 1;
  }

  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) {
      byte = (byte << 1) | (bits[i + j] ?? 0);
    }
    dataCodewords.push(byte);
  }

  const ecCodewords = computeReedSolomonEc(dataCodewords, spec.ecCodewords);
  const allCodewords = [...dataCodewords, ...ecCodewords];

  const size = spec.size;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false)
  );

  placeFinderPattern(modules, isFunction, 0, 0, size);
  placeFinderPattern(modules, isFunction, 0, size - 7, size);
  placeFinderPattern(modules, isFunction, size - 7, 0, size);

  for (let i = 8; i < size - 8; i += 1) {
    modules[6]![i] = i % 2 === 0;
    isFunction[6]![i] = true;
    modules[i]![6] = i % 2 === 0;
    isFunction[i]![6] = true;
  }

  for (const r of spec.alignmentCenters) {
    for (const c of spec.alignmentCenters) {
      if (
        (r === 6 && c === 6) ||
        (r === 6 && c === size - 7) ||
        (r === size - 7 && c === 6)
      ) {
        continue;
      }
      placeAlignmentPattern(modules, isFunction, r, c);
    }
  }

  // Reserve format info areas
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      isFunction[8]![i] = true;
      isFunction[i]![8] = true;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    isFunction[8]![size - 1 - i] = true;
    isFunction[size - 1 - i]![8] = true;
  }
  modules[size - 8]![8] = true;
  isFunction[size - 8]![8] = true;

  // Zigzag placement of data + EC bits
  let bitIdx = 0;
  const totalBits = allCodewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      const upward = ((right + 1) & 2) === 0;
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j += 1) {
        const c = right - j;
        if (!isFunction[r]![c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const cw = allCodewords[bitIdx >>> 3] ?? 0;
            dark = ((cw >>> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx += 1;
          }
          // Mask pattern 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) {
            dark = !dark;
          }
          modules[r]![c] = dark;
        }
      }
    }
  }

  // Format information for ECC Level L (01) and Mask 0 (000) -> 0x77c4
  const formatBits = 0x77c4;
  for (let i = 0; i <= 5; i += 1) modules[8]![i] = ((formatBits >>> i) & 1) === 1;
  modules[8]![7] = ((formatBits >>> 6) & 1) === 1;
  modules[8]![8] = ((formatBits >>> 7) & 1) === 1;
  modules[7]![8] = ((formatBits >>> 8) & 1) === 1;
  for (let i = 9; i < 15; i += 1) {
    modules[14 - i]![8] = ((formatBits >>> i) & 1) === 1;
  }
  for (let i = 0; i < 8; i += 1) {
    modules[8]![size - 1 - i] = ((formatBits >>> i) & 1) === 1;
  }
  for (let i = 8; i < 15; i += 1) {
    modules[size - 15 + i]![8] = ((formatBits >>> i) & 1) === 1;
  }

  return modules;
}

/**
 * Sinh chuỗi SVG mã QR sắc nét để hiển thị trực tiếp hoặc nhúng vào trang chia sẻ
 */
export function generateQrCodeSvg(text: string, margin = 2): string {
  const matrix = buildQrMatrix(text);
  const size = matrix.length;
  const viewSize = size + margin * 2;
  const paths: string[] = [];

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (matrix[r]?.[c]) {
        paths.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="${viewSize}" height="${viewSize}" fill="#ffffff"/><path d="${paths.join("")}" fill="#0f172a"/></svg>`;
}

