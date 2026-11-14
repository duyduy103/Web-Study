import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generatePaymentCode } from "@/lib/payments/sepay";
import { vi } from "@/lib/i18n/vi";
import type { PaymentOrder } from "@/lib/supabase/types";

const createOrderSchema = z.object({
  plan_code: z.enum(["premium"]).default("premium"),
  period: z.enum(["month", "year"]),
});

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
    }

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { error: vi.limits.systemErrorFailClosed },
        { status: 500 }
      );
    }

    const nowMs = Date.now();
    const normalizedOrders = ((orders ?? []) as PaymentOrder[]).map((o) => {
      if (o.status === "pending" && new Date(o.expires_at).getTime() <= nowMs) {
        return { ...o, status: "expired" as const };
      }
      return o;
    });

    return NextResponse.json({ orders: normalizedOrders });
  } catch {
    return NextResponse.json(
      { error: vi.limits.systemErrorFailClosed },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Chu kỳ hoặc gói thanh toán không hợp lệ." },
        { status: 400 }
      );
    }

    const { plan_code, period } = parsed.data;

    // Thử tối đa 3 lần phòng trường hợp cực hiếm trùng payment_code ngẫu nhiên
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const paymentCode = generatePaymentCode();
      const { data, error } = await supabase.rpc(
        "create_or_reuse_payment_order",
        {
          p_plan_code: plan_code,
          p_period: period,
          p_payment_code: paymentCode,
        }
      );

      if (!error && data && typeof data === "object") {
        const payload = data as { order?: unknown; reused?: boolean };
        return NextResponse.json({
          order: payload.order,
          reused: Boolean(payload.reused),
        });
      }

      lastError = error?.message ?? "Không thể khởi tạo đơn thanh toán.";
      // Nếu không phải lỗi trùng mã unique (23505) thì dừng ngay
      if (error?.code !== "23505") {
        break;
      }
    }

    return NextResponse.json(
      { error: lastError || vi.limits.systemErrorFailClosed },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { error: vi.limits.systemErrorFailClosed },
      { status: 500 }
    );
  }
}
