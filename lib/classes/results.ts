import type {
  TeacherAttemptItem,
  TeacherExamQuestionItem,
} from "@/components/features/exams/attempt-grading-modal";

export interface ClassResultStudent {
  user_id: string;
  display_name: string;
  email: string;
  status: "active";
  joined_at: string;
}

export interface ClassResultAssignment {
  id: string;
  kind: "exam" | "study";
  exam_id: string | null;
  set_id: string | null;
  title: string;
  due_at: string | null;
  lock_after_due: boolean;
  is_open: boolean;
  created_at: string;
  exam_total_points: number;
  set_approved_cards: number;
}

export type ClassExamCellStatus =
  | "not_submitted"
  | "in_progress"
  | "submitted"
  | "expired";

export interface ClassExamCell {
  assignment_id: string;
  exam_id: string | null;
  student_id: string;
  attempts_count: number;
  submitted_count: number;
  status: ClassExamCellStatus;
  is_late: boolean;
  score: number | null;
  total_points: number;
  needs_manual_review: boolean;
  duration_seconds: number | null;
  started_at: string | null;
  submitted_at: string | null;
  latest_attempt_id: string | null;
}

export interface ClassStudyCell {
  assignment_id: string;
  set_id: string | null;
  student_id: string;
  total_cards: number;
  cards_reviewed: number;
  total_reviews: number;
  retention_rate: number;
  leech_count: number;
  last_studied_at: string | null;
  status: "not_submitted" | "submitted";
}

export interface ClassExamDetailPayload {
  exam_id: string;
  total_points: number;
  questions: TeacherExamQuestionItem[];
  attempts: Array<TeacherAttemptItem & { studentId?: string | null }>;
}

export interface ClassStudyQuestionStat {
  question_id: string;
  stem: string;
  topic: string | null;
  type: string;
  total_lapses: number;
  leech_learners_count: number;
  again_reviews_count: number;
  total_reviews_count: number;
}

export interface ClassStudyDetailPayload {
  set_id: string;
  questions: ClassStudyQuestionStat[];
}

export interface TeacherClassResultsPayload {
  error: string | null;
  class_id: string;
  class_name: string;
  students: ClassResultStudent[];
  assignments: ClassResultAssignment[];
  exam_cells: ClassExamCell[];
  study_cells: ClassStudyCell[];
  exam_details: Record<string, ClassExamDetailPayload>;
  study_details: Record<string, ClassStudyDetailPayload>;
}

export interface ScoreDistributionBucket {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

export interface ClassExamAssignmentAnalytics {
  submittedCount: number;
  notSubmittedCount: number;
  inProgressCount: number;
  needsReviewCount: number;
  averageScore: number;
  totalPoints: number;
  scoreDistribution: ScoreDistributionBucket[];
  questionStats: Array<
    TeacherExamQuestionItem & {
      orderNumber: number;
      correctCount: number;
      pendingReviewCount: number;
      correctRate: number;
      isMostMissed: boolean;
    }
  >;
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
 * Tính phân bố điểm theo 4 mức phần trăm (<50%, 50–69%, 70–84%, 85–100%)
 * dùng cho thanh CSS trong tab Kết quả của lớp
 */
export function computeScoreDistribution(
  scores: readonly number[],
  totalPoints: number
): ScoreDistributionBucket[] {
  const safeMax = totalPoints > 0 ? totalPoints : 10;
  let b1 = 0; // < 50%
  let b2 = 0; // 50% - 69%
  let b3 = 0; // 70% - 84%
  let b4 = 0; // >= 85%

  for (const s of scores) {
    const ratio = (Math.max(0, s) / safeMax) * 100;
    if (ratio < 50) b1 += 1;
    else if (ratio < 70) b2 += 1;
    else if (ratio < 85) b3 += 1;
    else b4 += 1;
  }

  const total = scores.length;
  const pct = (count: number) =>
    total > 0 ? Math.round((count / total) * 100) : 0;

  return [
    {
      key: "below_50",
      label: "Dưới 50%",
      count: b1,
      percentage: pct(b1),
    },
    {
      key: "50_69",
      label: "50% – 69%",
      count: b2,
      percentage: pct(b2),
    },
    {
      key: "70_84",
      label: "70% – 84%",
      count: b3,
      percentage: pct(b3),
    },
    {
      key: "85_100",
      label: "85% – 100%",
      count: b4,
      percentage: pct(b4),
    },
  ];
}

/**
 * Tính thống kê chi tiết cho một bài kiểm tra trong lớp:
 * - Điểm trung bình
 * - Phân bố điểm bằng thanh CSS
 * - Câu sai nhiều nhất (tái dùng công thức Bước 5)
 */
export function computeClassExamAssignmentAnalytics(params: {
  studentsCount: number;
  cells: readonly ClassExamCell[];
  detail: ClassExamDetailPayload | undefined;
}): ClassExamAssignmentAnalytics {
  const { studentsCount, cells, detail } = params;
  const totalPoints = detail?.total_points ?? cells[0]?.total_points ?? 0;

  const submittedCells = cells.filter(
    (c) => c.status === "submitted" || c.status === "expired"
  );
  const inProgressCount = cells.filter(
    (c) => c.status === "in_progress"
  ).length;
  const notSubmittedCount = Math.max(
    0,
    studentsCount - submittedCells.length - inProgressCount
  );
  const needsReviewCount = submittedCells.filter(
    (c) => c.needs_manual_review
  ).length;

  const validScores = submittedCells.map((c) => Number(c.score ?? 0));
  const averageScore =
    validScores.length > 0
      ? Math.round(
          (validScores.reduce((acc, s) => acc + s, 0) / validScores.length) *
            100
        ) / 100
      : 0;

  const scoreDistribution = computeScoreDistribution(validScores, totalPoints);

  const questions = detail?.questions ?? [];
  const submittedAttempts = (detail?.attempts ?? []).filter(
    (a) => a.status === "submitted" || a.status === "expired"
  );
  const totalDone = submittedAttempts.length;

  const rawStats = questions.map((q, idx) => {
    let correct = 0;
    let pendingReview = 0;
    for (const att of submittedAttempts) {
      const ans = att.answers.find(
        (a) => a.examQuestionId === q.examQuestionId
      );
      if (ans?.isCorrect) {
        correct += 1;
      }
      if (ans?.needsReview) {
        pendingReview += 1;
      }
    }
    const correctRate =
      totalDone > 0 ? Math.round((correct / totalDone) * 100) : 0;
    return {
      ...q,
      orderNumber: idx + 1,
      correctCount: correct,
      pendingReviewCount: pendingReview,
      correctRate,
    };
  });

  const minRate =
    totalDone > 0 && rawStats.length > 0
      ? Math.min(...rawStats.map((item) => item.correctRate))
      : 100;

  const questionStats = rawStats.map((item) => ({
    ...item,
    isMostMissed:
      totalDone > 0 && item.correctRate === minRate && item.correctRate < 80,
  }));

  return {
    submittedCount: submittedCells.length,
    notSubmittedCount,
    inProgressCount,
    needsReviewCount,
    averageScore,
    totalPoints,
    scoreDistribution,
    questionStats,
  };
}

/**
 * Xuất CSV bảng điểm lớp học (UTF-8 BOM \uFEFF để mở bằng Excel hiển thị chuẩn tiếng Việt).
 * Đảm bảo chỉ chứa danh sách học sinh thuộc lớp được truyền vào.
 */
export function generateClassGradebookCsv(params: {
  className: string;
  students: readonly ClassResultStudent[];
  assignments: readonly ClassResultAssignment[];
  examCells: readonly ClassExamCell[];
  studyCells: readonly ClassStudyCell[];
  selectedAssignmentId?: string | null;
}): string {
  const {
    className,
    students,
    assignments,
    examCells,
    studyCells,
    selectedAssignmentId,
  } = params;

  const allowedStudentIds = new Set(students.map((s) => s.user_id));

  // Nếu lọc theo 1 bài giao cụ thể -> xuất bảng chi tiết từng cột của bài đó
  const singleAssignment = selectedAssignmentId
    ? assignments.find((a) => a.id === selectedAssignmentId) ?? null
    : null;

  if (singleAssignment && singleAssignment.kind === "exam") {
    const headers = [
      "STT",
      "Họ và tên",
      "Email",
      "Lớp",
      "Bài được giao",
      "Điểm số",
      "Thang điểm",
      "Loại điểm",
      "Trạng thái",
      "Số lần làm",
      "Thời gian làm (giây)",
      "Nộp lúc",
    ];
    const lines: string[] = [headers.map(escapeCsvCell).join(",")];

    students.forEach((student, idx) => {
      const cell = examCells.find(
        (c) =>
          c.assignment_id === singleAssignment.id &&
          c.student_id === student.user_id &&
          allowedStudentIds.has(c.student_id)
      );

      const statusText =
        !cell || cell.status === "not_submitted"
          ? "Chưa nộp"
          : cell.status === "in_progress"
            ? "Đang làm"
            : cell.status === "expired"
              ? "Hết giờ (Tự nộp)"
              : cell.is_late
                ? "Đã nộp (Quá hạn)"
                : "Đã nộp";

      const scoreType =
        !cell || cell.score === null
          ? ""
          : cell.needs_manual_review
            ? "Điểm tạm tính"
            : "Chính thức";

      const row = [
        String(idx + 1),
        student.display_name,
        student.email,
        className,
        singleAssignment.title,
        cell && cell.score !== null ? String(cell.score) : "",
        String(cell?.total_points ?? singleAssignment.exam_total_points),
        scoreType,
        statusText,
        String(cell?.attempts_count ?? 0),
        cell?.duration_seconds !== null && cell?.duration_seconds !== undefined
          ? String(cell.duration_seconds)
          : "",
        cell?.submitted_at
          ? new Date(cell.submitted_at).toLocaleString("vi-VN")
          : "",
      ];
      lines.push(row.map(escapeCsvCell).join(","));
    });

    return `\uFEFF${lines.join("\r\n")}`;
  }

  if (singleAssignment && singleAssignment.kind === "study") {
    const headers = [
      "STT",
      "Họ và tên",
      "Email",
      "Lớp",
      "Bộ ôn tập",
      "Số thẻ đã ôn",
      "Tổng số thẻ",
      "Tổng lượt lật thẻ",
      "Tỉ lệ nhớ (%)",
      "Số câu hay quên",
      "Trạng thái",
      "Ôn gần nhất",
    ];
    const lines: string[] = [headers.map(escapeCsvCell).join(",")];

    students.forEach((student, idx) => {
      const cell = studyCells.find(
        (c) =>
          c.assignment_id === singleAssignment.id &&
          c.student_id === student.user_id &&
          allowedStudentIds.has(c.student_id)
      );

      const cardsReviewed = cell?.cards_reviewed ?? 0;
      const totalCards =
        cell?.total_cards ?? singleAssignment.set_approved_cards;
      const statusText = cardsReviewed > 0 ? "Đã ôn tập" : "Chưa nộp";

      const row = [
        String(idx + 1),
        student.display_name,
        student.email,
        className,
        singleAssignment.title,
        String(cardsReviewed),
        String(totalCards),
        String(cell?.total_reviews ?? 0),
        String(cell?.retention_rate ?? 0),
        String(cell?.leech_count ?? 0),
        statusText,
        cell?.last_studied_at
          ? new Date(cell.last_studied_at).toLocaleString("vi-VN")
          : "",
      ];
      lines.push(row.map(escapeCsvCell).join(","));
    });

    return `\uFEFF${lines.join("\r\n")}`;
  }

  // Mặc định: Ma trận tổng hợp Học sinh × Tất cả bài giao trong lớp
  const assignmentHeaders = assignments.map((a) =>
    a.kind === "exam"
      ? `${a.title} (Điểm/${a.exam_total_points})`
      : `${a.title} (Ôn tập/${a.set_approved_cards} thẻ)`
  );

  const headers = [
    "STT",
    "Họ và tên",
    "Email",
    "Lớp",
    ...assignmentHeaders,
    "Số bài chưa nộp",
  ];
  const lines: string[] = [headers.map(escapeCsvCell).join(",")];

  students.forEach((student, idx) => {
    let missingCount = 0;
    const dynamicCells = assignments.map((assignment) => {
      if (assignment.kind === "exam") {
        const cell = examCells.find(
          (c) =>
            c.assignment_id === assignment.id &&
            c.student_id === student.user_id &&
            allowedStudentIds.has(c.student_id)
        );
        if (!cell || cell.status === "not_submitted") {
          missingCount += 1;
          return "Chưa nộp";
        }
        if (cell.status === "in_progress") {
          missingCount += 1;
          return "Đang làm";
        }
        return `${cell.score ?? 0}/${cell.total_points}${
          cell.needs_manual_review ? " (Tạm tính)" : ""
        }`;
      }

      const stCell = studyCells.find(
        (c) =>
          c.assignment_id === assignment.id &&
          c.student_id === student.user_id &&
          allowedStudentIds.has(c.student_id)
      );
      if (!stCell || stCell.cards_reviewed === 0) {
        missingCount += 1;
        return "Chưa nộp";
      }
      return `${stCell.cards_reviewed}/${stCell.total_cards} thẻ (${stCell.retention_rate}% nhớ)`;
    });

    const row = [
      String(idx + 1),
      student.display_name,
      student.email,
      className,
      ...dynamicCells,
      String(missingCount),
    ];
    lines.push(row.map(escapeCsvCell).join(","));
  });

  return `\uFEFF${lines.join("\r\n")}`;
}

