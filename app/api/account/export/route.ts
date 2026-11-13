import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";

export async function GET() {
  try {
    const supabase = await createClient();
    const authProfile = await getAuthenticatedProfile(supabase);

    if (!authProfile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authProfile.user.id;

    // 1. Hồ sơ cá nhân
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, display_name, created_at, last_seen_at")
      .eq("id", userId)
      .single();

    // 2. Bộ câu hỏi & chi tiết câu hỏi của chính người dùng
    const { data: questionSets } = await supabase
      .from("question_sets")
      .select("id, title, subject, grade, created_at, source_file_hash")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    const setIds = (questionSets ?? []).map((s) => s.id);

    let questions: unknown[] = [];
    if (setIds.length > 0) {
      const { data: qList } = await supabase
        .from("questions")
        .select("id, set_id, type, stem, explanation, source_ref, difficulty, status, created_at")
        .in("set_id", setIds);
      questions = qList ?? [];
    }

    // 3. Hồ sơ học tập & lịch ôn FSRS
    const { data: learner } = await supabase
      .from("learners")
      .select("id, nickname, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    let cardStates: unknown[] = [];
    let reviewLogs: unknown[] = [];

    if (learner) {
      const { data: cards } = await supabase
        .from("card_states")
        .select("question_id, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, last_review, due")
        .eq("learner_id", learner.id);
      cardStates = cards ?? [];

      const { data: logs } = await supabase
        .from("review_logs")
        .select("question_id, rating, state_before, elapsed_days, scheduled_days, reviewed_at")
        .eq("learner_id", learner.id)
        .order("reviewed_at", { ascending: false })
        .limit(1000);
      reviewLogs = logs ?? [];
    }

    // Đóng gói JSON hoàn chỉnh
    const exportData = {
      exported_at: new Date().toISOString(),
      app: "MemoQuiz",
      profile: {
        ...profile,
        email: authProfile.user.email,
      },
      question_sets: (questionSets ?? []).map((s) => ({
        ...s,
        questions: (questions as Array<{ set_id: string }>).filter((q) => q.set_id === s.id),
      })),
      learning: {
        learner_profile: learner ?? null,
        fsrs_cards: cardStates,
        review_logs: reviewLogs,
      },
    };

    const fileName = `memoquiz-my-data-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Xuất dữ liệu thất bại" },
      { status: 500 }
    );
  }
}
