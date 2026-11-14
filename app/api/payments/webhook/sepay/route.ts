import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  extractPaymentCodeFromWebhook,
  sanitizeSepayPayload,
  sepayWebhookPayloadSchema,
  verifySepayWebhookAuth,
} from "@/lib/payments/sepay";

export async function POST(request: NextRequest) {
  try {
    // 1. Xác thực header Authorization dạng "Apikey <key>" bằng so sánh hằng thời gian
    const authHeader = request.headers.get("authorization");
    const expectedKey = process.env.SEPAY_WEBHOOK_API_KEY;

    if (!verifySepayWebhookAuth(authHeader, expectedKey)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // 2. Rate limit mềm theo IP để chống flood
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
    try {
      const { data: allowed } = await supabase.rpc("check_rate_limit", {
        p_key: `sepay_webhook:${ip}`,
        p_max_hits: 120,
        p_window_seconds: 60,
      });
      if (allowed === false) {
        return NextResponse.json(
          { success: false, error: "Too many requests" },
          { status: 429 }
        );
      }
    } catch {
      // Không chặn giao dịch thật nếu hàm rate limit mềm gặp sự cố
    }

    // 3. Kiểm tra định dạng JSON & schema Zod của SePay
    const rawBody = await request.json().catch(() => null);
    const parsed = sepayWebhookPayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid webhook payload" },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const eventId = String(payload.id).trim();
    const paymentCode = extractPaymentCodeFromWebhook({
      code: payload.code,
      content: payload.content,
      description: payload.description,
      prefix: process.env.PAYMENT_CODE_PREFIX,
    });
    const sanitizedPayload = sanitizeSepayPayload(payload);

    // 4. Gọi hàm xử lý nguyên tử trong DB (chống trùng theo unique(provider, event_id),
    // kiểm tra transferType='in', khớp đơn + số tiền, kích hoạt gói hoặc đưa vào needs_review)
    const { error } = await supabase.rpc("process_sepay_webhook_event", {
      p_event_id: eventId,
      p_transfer_type: payload.transferType,
      p_transfer_amount: Math.round(payload.transferAmount),
      p_payment_code: paymentCode,
      p_reference_code: payload.referenceCode ?? null,
      p_payload: sanitizedPayload,
    });

    if (error) {
      console.error("[sepay-webhook] Database RPC error code:", error.code);
      return NextResponse.json(
        { success: false, error: "Internal processing error" },
        { status: 500 }
      );
    }

    // 5. Trả HTTP 200 với JSON {"success": true} kể cả khi giao dịch vào needs_review hoặc trùng
    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
