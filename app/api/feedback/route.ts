import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { vi } from "@/lib/i18n/vi";

const feedbackSchema = z.object({
  type: z.enum(["bug", "idea", "question", "upgrade_request", "other"]),
  content: z
    .string()
    .trim()
    .min(10, { message: vi.feedback.minLengthError })
    .max(2000, { message: vi.feedback.maxLengthError }),
  contact_email: z.string().trim().email().optional().or(z.literal("")),
  context_meta: z
    .object({
      url: z.string().optional(),
      user_agent: z.string().optional(),
      role: z.string().optional(),
    })
    .default({}),
  website_hp: z.string().optional(), // Honeypot
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = feedbackSchema.safeParse(json);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { error: issue?.message || "Dữ liệu không hợp lệ." },
        { status: 400 }
      );
    }

    const { type, content, contact_email, context_meta, website_hp } =
      parsed.data;

    // Chống bot spam: Nếu trường honeypot bị điền, âm thầm báo thành công mà không lưu DB
    if (website_hp && website_hp.trim().length > 0) {
      return NextResponse.json({ ok: true });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Khách vãng lai bắt buộc phải có email liên hệ
    if (!user && (!contact_email || contact_email.trim().length === 0)) {
      return NextResponse.json(
        { error: vi.feedback.emailRequiredError },
        { status: 400 }
      );
    }

    // Rate limiting: 5 lần gửi / 10 phút theo tài khoản hoặc IP
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "127.0.0.1";
    const rateLimitKey = user ? `feedback:user:${user.id}` : `feedback:ip:${clientIp}`;

    const { data: allowed, error: rateLimitErr } = await supabase.rpc(
      "check_rate_limit",
      {
        p_key: rateLimitKey,
        p_max_hits: 5,
        p_window_seconds: 600,
      }
    );

    if (rateLimitErr || allowed === false) {
      return NextResponse.json(
        { error: vi.feedback.rateLimitError },
        { status: 429 }
      );
    }

    const finalMeta = {
      ...context_meta,
      user_id: user?.id ?? null,
      ip: clientIp,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("feedback")
      .insert({
        user_id: user?.id ?? null,
        type,
        content,
        contact_email: contact_email || user?.email || null,
        context_meta: finalMeta,
        status: "new",
        priority: "medium",
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: "Không thể lưu góp ý. Vui lòng thử lại sau." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: inserted.id });
  } catch {
    return NextResponse.json(
      { error: "Đã có lỗi xảy ra khi xử lý góp ý." },
      { status: 500 }
    );
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: list, error } = await supabase
    .from("feedback")
    .select(
      "id, type, content, status, priority, public_response, public_response_at, user_read_at, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ feedback: list ?? [] });
}
