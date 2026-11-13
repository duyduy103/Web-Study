import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTeacherRole } from "@/lib/auth/roles";
import { buildPrintExamPackage } from "@/lib/export";
import {
  generateAnswerKeyAndCrossRefDocxBuffer,
  generateExamPapersDocxBuffer,
} from "@/lib/export/docx-builder";
import type { PrintExamHeaderInfo } from "@/lib/export/types";
import type {
  ExamQuestionSnapshot,
  ExamQuestionWithSnapshot,
} from "@/lib/grading/types";
import { vi } from "@/lib/i18n/vi";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id: examId } = await params;
    const supabase = await createClient();
    const auth = await requireTeacherRole(supabase);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.profile.user;

    // Kiểm tra chặt quyền sở hữu của giáo viên trên server
    const { data: exam } = await supabase
      .from("exams")
      .select(
        "id, owner_id, title, duration_min, shuffle_questions, shuffle_choices, version_count, seed, header_info"
      )
      .eq("id", examId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!exam) {
      return NextResponse.json(
        { error: vi.setDetails.notFoundTitle },
        { status: 404 }
      );
    }

    const [{ data: eqRows }, { data: verRows }] = await Promise.all([
      supabase
        .from("exam_questions")
        .select("id, question_id, points, position, question_snapshot")
        .eq("exam_id", exam.id)
        .order("position", { ascending: true }),
      supabase
        .from("exam_versions")
        .select("code, question_order, choice_orders")
        .eq("exam_id", exam.id)
        .order("code", { ascending: true }),
    ]);

    const questionsWithSnapshot: ExamQuestionWithSnapshot[] = (
      eqRows ?? []
    ).map((row) => ({
      examQuestionId: row.id,
      questionId: row.question_id,
      points: Number(row.points) || 0,
      position: row.position,
      snapshot: row.question_snapshot as unknown as ExamQuestionSnapshot,
    }));

    const rawHeader = (exam.header_info ?? {}) as Record<string, unknown>;
    const header: PrintExamHeaderInfo = {
      schoolName:
        typeof rawHeader.schoolName === "string" ? rawHeader.schoolName : null,
      examName:
        typeof rawHeader.examName === "string" && rawHeader.examName.trim()
          ? rawHeader.examName
          : exam.title,
      subject: typeof rawHeader.subject === "string" ? rawHeader.subject : null,
      className:
        typeof rawHeader.className === "string" ? rawHeader.className : null,
      durationMinutes:
        typeof rawHeader.durationMinutes === "number"
          ? rawHeader.durationMinutes
          : exam.duration_min,
      studentInfoLine:
        typeof rawHeader.studentInfoLine === "string"
          ? rawHeader.studentInfoLine
          : vi.printExam.studentInfoLineDefault,
    };

    const existingVersions = (verRows ?? []).map((v) => ({
      code: v.code,
      question_order: Array.isArray(v.question_order) ? v.question_order : [],
      choice_orders: (v.choice_orders ?? {}) as Record<string, string[]>,
    }));

    const pkg = buildPrintExamPackage({
      header,
      questions: questionsWithSnapshot,
      versionCount: exam.version_count ?? 4,
      seed: exam.seed || exam.id,
      shuffleQuestions: exam.shuffle_questions,
      shuffleChoices: exam.shuffle_choices,
      existingVersions:
        existingVersions.length > 0 ? existingVersions : undefined,
    });

    const url = new URL(request.url);
    const docType = url.searchParams.get("type") ?? "papers";
    const versionParam = url.searchParams.get("version");

    const safeTitle = exam.title
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}_\-]+/gu, "_")
      .replace(/_+/g, "_")
      .slice(0, 60);

    let buffer: Buffer;
    let fileNameUtf8: string;

    if (docType === "answers") {
      buffer = await generateAnswerKeyAndCrossRefDocxBuffer(pkg);
      fileNameUtf8 = `Dap_an_va_Doi_chieu_${safeTitle || "De_thi"}.docx`;
    } else {
      buffer = await generateExamPapersDocxBuffer(pkg, versionParam);
      fileNameUtf8 = versionParam
        ? `De_thi_Ma_${versionParam}_${safeTitle || "De_thi"}.docx`
        : `De_thi_Tat_ca_ma_de_${safeTitle || "De_thi"}.docx`;
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="memoquiz-export.docx"; filename*=UTF-8''${encodeURIComponent(fileNameUtf8)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : vi.importSet.errors.saveFailed,
      },
      { status: 500 }
    );
  }
}

