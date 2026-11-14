import { describe, expect, it, vi as vitest } from "vitest";
import { NextRequest } from "next/server";
import {
  UNAMBIGUOUS_PAYMENT_CODE_ALPHABET,
  buildSepayQrUrl,
  calculateServerOrderPrice,
  executeActivateSubscriptionFromOrder,
  extractPaymentCodeFromWebhook,
  generatePaymentCode,
  handleSepayWebhookInMemory,
  verifySepayWebhookAuth,
  type InMemoryPaymentState,
} from "@/lib/payments/sepay";

function createTestPaymentState(): InMemoryPaymentState {
  return {
    plans: {
      free: {
        code: "free",
        name: "Miễn phí",
        active: true,
        prices: {},
        period_days: {},
      },
      premium: {
        code: "premium",
        name: "Premium",
        active: true,
        prices: { month: 39000, year: 299000 },
        period_days: { month: 30, year: 365 },
      },
    },
    orders: new Map(),
    subscriptions: [],
    paymentEvents: new Map(),
    notifications: [],
  };
}

describe("Bước 13 - Giai đoạn 2: Thanh toán tự động SePay & VietQR", () => {
  const SECRET_KEY = "sepay_test_secret_key_2026_very_secure";

  it("1. generatePaymentCode chỉ sinh chữ HOA và số không dễ nhầm (không có 0, O, 1, I, khoảng trắng)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePaymentCode("MQ");
      expect(code).toMatch(/^MQ[A-HJ-NP-Z2-9]{8}$/);
      expect(code).not.toMatch(/[0O1I\s]/);
      for (const ch of code.slice(2)) {
        expect(UNAMBIGUOUS_PAYMENT_CODE_ALPHABET.includes(ch)).toBe(true);
      }
    }
  });

  it("2. buildSepayQrUrl mã hóa đúng URL ảnh QR SePay bằng URLSearchParams", () => {
    const url = buildSepayQrUrl({
      bankAccountNumber: "0123456789",
      bankCode: "MBBank",
      amount: 39000,
      paymentCode: "MQK7M9P2X4",
    });
    expect(url).toBe(
      "https://qr.sepay.vn/img?acc=0123456789&bank=MBBank&amount=39000&des=MQK7M9P2X4"
    );
  });

  it("3. Giá đơn luôn tính từ plans.prices phía server, từ chối gói/chu kỳ không có giá", () => {
    const state = createTestPaymentState();
    const monthCalc = calculateServerOrderPrice(state.plans.premium, "month");
    expect(monthCalc).toEqual({ amount: 39000, periodDays: 30 });

    const yearCalc = calculateServerOrderPrice(state.plans.premium, "year");
    expect(yearCalc).toEqual({ amount: 299000, periodDays: 365 });

    expect(() => calculateServerOrderPrice(state.plans.free, "month")).toThrow(
      /không có mức giá/i
    );
  });

  it("4. verifySepayWebhookAuth kiểm tra đúng định dạng 'Apikey <key>' bằng timingSafeEqual", () => {
    expect(verifySepayWebhookAuth(`Apikey ${SECRET_KEY}`, SECRET_KEY)).toBe(true);
    expect(verifySepayWebhookAuth(`apikey   ${SECRET_KEY} `, SECRET_KEY)).toBe(
      true
    );
    expect(verifySepayWebhookAuth(`Bearer ${SECRET_KEY}`, SECRET_KEY)).toBe(
      false
    );
    expect(verifySepayWebhookAuth("Apikey wrong_key", SECRET_KEY)).toBe(false);
    expect(verifySepayWebhookAuth(null, SECRET_KEY)).toBe(false);
    expect(verifySepayWebhookAuth(`Apikey ${SECRET_KEY}`, "")).toBe(false);
  });

  it("5. extractPaymentCodeFromWebhook tách đúng mã ở trường code và content (kể cả chữ thường, khoảng trắng)", () => {
    // Khớp từ trường code
    expect(
      extractPaymentCodeFromWebhook({
        code: "MQK7M9P2X4",
        content: "chuyen khoan",
        prefix: "MQ",
      })
    ).toBe("MQK7M9P2X4");

    // Khớp từ trường content chữ thường + có khoảng trắng sau prefix
    expect(
      extractPaymentCodeFromWebhook({
        code: null,
        content: "NGUYEN VAN A chuyen khoan mq k7m9p2x4 thanh toan goi",
        prefix: "MQ",
      })
    ).toBe("MQK7M9P2X4");

    // Không có mã hợp lệ
    expect(
      extractPaymentCodeFromWebhook({
        code: null,
        content: "chuyen tien an trua 50k",
        prefix: "MQ",
      })
    ).toBeNull();
  });

  it("6. Webhook SePay: từ chối Authorization sai (401) và schema sai (400), chấp nhận trường thừa (.passthrough)", () => {
    const state = createTestPaymentState();

    const unauth = handleSepayWebhookInMemory({
      state,
      authHeader: "Apikey wrong",
      expectedApiKey: SECRET_KEY,
      rawBody: { id: 1, transferType: "in", transferAmount: 39000 },
    });
    expect(unauth.httpStatus).toBe(401);

    const badSchema = handleSepayWebhookInMemory({
      state,
      authHeader: `Apikey ${SECRET_KEY}`,
      expectedApiKey: SECRET_KEY,
      rawBody: { id: 1, transferType: "in", transferAmount: "not-a-number" },
    });
    expect(badSchema.httpStatus).toBe(400);

    const extraFieldsOk = handleSepayWebhookInMemory({
      state,
      authHeader: `Apikey ${SECRET_KEY}`,
      expectedApiKey: SECRET_KEY,
      rawBody: {
        id: 1001,
        transferType: "out",
        transferAmount: 50000,
        unexpectedExtraField: { foo: "bar" },
      },
    });
    expect(extraFieldsOk.httpStatus).toBe(200);
    expect(extraFieldsOk.body).toEqual({ success: true });
    expect(extraFieldsOk.outcome?.eventStatus).toBe("ignored");
  });

  it("7. Webhook SePay: chống xử lý trùng theo event_id và bỏ qua giao dịch transferType = 'out'", () => {
    const state = createTestPaymentState();
    state.orders.set("ord-1", {
      id: "ord-1",
      user_id: "user-1",
      plan_code: "premium",
      period: "month",
      amount: 39000,
      currency: "VND",
      status: "pending",
      provider: "sepay",
      provider_ref: null,
      payment_code: "MQK7M9P2X4",
      created_at: "2026-11-14T00:00:00.000Z",
      paid_at: null,
      expires_at: "2026-11-16T00:00:00.000Z",
    });

    const now = new Date("2026-11-14T10:00:00.000Z");

    // Lần 1: thành công
    const first = handleSepayWebhookInMemory({
      state,
      authHeader: `Apikey ${SECRET_KEY}`,
      expectedApiKey: SECRET_KEY,
      paymentCodePrefix: "MQ",
      now,
      rawBody: {
        id: 2001,
        transferType: "in",
        transferAmount: 39000,
        code: null,
        content: "MBVCB.12345. mq k7m9p2x4 .CT tu 0123",
      },
    });
    expect(first.httpStatus).toBe(200);
    expect(first.outcome?.eventStatus).toBe("processed");
    expect(state.orders.get("ord-1")?.status).toBe("paid");
    expect(state.subscriptions).toHaveLength(1);
    const firstPeriodEnd = state.subscriptions[0]!.period_end;

    // Lần 2: cùng event_id = 2001 gửi lặp lại -> trả 200 {"success": true} và không cộng thêm ngày
    const duplicate = handleSepayWebhookInMemory({
      state,
      authHeader: `Apikey ${SECRET_KEY}`,
      expectedApiKey: SECRET_KEY,
      paymentCodePrefix: "MQ",
      now,
      rawBody: {
        id: 2001,
        transferType: "in",
        transferAmount: 39000,
        code: "MQK7M9P2X4",
        content: "MQK7M9P2X4",
      },
    });
    expect(duplicate.httpStatus).toBe(200);
    expect(duplicate.body).toEqual({ success: true });
    expect(duplicate.outcome?.duplicate).toBe(true);
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]!.period_end).toBe(firstPeriodEnd);
  });

  it("8. Sai số tiền (thiếu/thừa) -> KHÔNG kích hoạt đơn, ghi payment_events(status='needs_review')", () => {
    const state = createTestPaymentState();
    state.orders.set("ord-under", {
      id: "ord-under",
      user_id: "user-2",
      plan_code: "premium",
      period: "month",
      amount: 39000,
      currency: "VND",
      status: "pending",
      provider: "sepay",
      provider_ref: null,
      payment_code: "MQABCDEF23",
      created_at: "2026-11-14T00:00:00.000Z",
      paid_at: null,
      expires_at: "2026-11-16T00:00:00.000Z",
    });

    // Chuyển thiếu (30000 thay vì 39000)
    const underpaid = handleSepayWebhookInMemory({
      state,
      authHeader: `Apikey ${SECRET_KEY}`,
      expectedApiKey: SECRET_KEY,
      rawBody: {
        id: 3001,
        transferType: "in",
        transferAmount: 30000,
        code: "MQABCDEF23",
        content: "MQABCDEF23",
      },
    });
    expect(underpaid.httpStatus).toBe(200);
    expect(underpaid.outcome?.eventStatus).toBe("needs_review");
    expect(underpaid.outcome?.reason).toBe("amount_mismatch");
    expect(state.orders.get("ord-under")?.status).toBe("pending");
    expect(state.subscriptions).toHaveLength(0);

    // Chuyển thừa (50000 thay vì 39000)
    const overpaid = handleSepayWebhookInMemory({
      state,
      authHeader: `Apikey ${SECRET_KEY}`,
      expectedApiKey: SECRET_KEY,
      rawBody: {
        id: 3002,
        transferType: "in",
        transferAmount: 50000,
        code: "MQABCDEF23",
        content: "MQABCDEF23",
      },
    });
    expect(overpaid.httpStatus).toBe(200);
    expect(overpaid.outcome?.eventStatus).toBe("needs_review");
    expect(overpaid.outcome?.reason).toBe("amount_mismatch");
    expect(state.orders.get("ord-under")?.status).toBe("pending");
  });

  it("9. Đơn expired (quá 48h) vẫn được kích hoạt khi tiền về đủ; đơn cancelled/refunded KHÔNG kích hoạt", () => {
    const state = createTestPaymentState();
    state.orders.set("ord-expired", {
      id: "ord-expired",
      user_id: "user-exp",
      plan_code: "premium",
      period: "month",
      amount: 39000,
      currency: "VND",
      status: "expired",
      provider: "sepay",
      provider_ref: null,
      payment_code: "MQEXPRD234",
      created_at: "2026-11-10T00:00:00.000Z",
      paid_at: null,
      expires_at: "2026-11-12T00:00:00.000Z",
    });

    state.orders.set("ord-cancelled", {
      id: "ord-cancelled",
      user_id: "user-can",
      plan_code: "premium",
      period: "month",
      amount: 39000,
      currency: "VND",
      status: "cancelled",
      provider: "sepay",
      provider_ref: null,
      payment_code: "MQCANCL234",
      created_at: "2026-11-14T00:00:00.000Z",
      paid_at: null,
      expires_at: "2026-11-16T00:00:00.000Z",
    });

    state.orders.set("ord-refunded", {
      id: "ord-refunded",
      user_id: "user-ref",
      plan_code: "premium",
      period: "month",
      amount: 39000,
      currency: "VND",
      status: "refunded",
      provider: "sepay",
      provider_ref: null,
      payment_code: "MQREFND234",
      created_at: "2026-11-14T00:00:00.000Z",
      paid_at: null,
      expires_at: "2026-11-16T00:00:00.000Z",
    });

    // Đơn expired -> kích hoạt thành công
    const expRes = handleSepayWebhookInMemory({
      state,
      authHeader: `Apikey ${SECRET_KEY}`,
      expectedApiKey: SECRET_KEY,
      rawBody: {
        id: 4001,
        transferType: "in",
        transferAmount: 39000,
        code: "MQEXPRD234",
      },
    });
    expect(expRes.outcome?.eventStatus).toBe("processed");
    expect(state.orders.get("ord-expired")?.status).toBe("paid");

    // Đơn cancelled -> KHÔNG kích hoạt, vào needs_review
    const canRes = handleSepayWebhookInMemory({
      state,
      authHeader: `Apikey ${SECRET_KEY}`,
      expectedApiKey: SECRET_KEY,
      rawBody: {
        id: 4002,
        transferType: "in",
        transferAmount: 39000,
        code: "MQCANCL234",
      },
    });
    expect(canRes.outcome?.eventStatus).toBe("needs_review");
    expect(state.orders.get("ord-cancelled")?.status).toBe("cancelled");

    // Đơn refunded -> KHÔNG kích hoạt, vào needs_review
    const refRes = handleSepayWebhookInMemory({
      state,
      authHeader: `Apikey ${SECRET_KEY}`,
      expectedApiKey: SECRET_KEY,
      rawBody: {
        id: 4003,
        transferType: "in",
        transferAmount: 39000,
        code: "MQREFND234",
      },
    });
    expect(refRes.outcome?.eventStatus).toBe("needs_review");
    expect(state.orders.get("ord-refunded")?.status).toBe("refunded");
  });

  it("10. Gọi activate_subscription_from_order 2 lần không cộng 2 lần & Gia hạn khi còn hạn sẽ cộng nối tiếp vào period_end", () => {
    const state = createTestPaymentState();
    const now = new Date("2026-11-14T00:00:00.000Z");
    const existingEnd = new Date("2026-11-24T00:00:00.000Z"); // Đang còn 10 ngày Premium

    state.subscriptions.push({
      id: "sub-existing",
      user_id: "user-renew",
      plan_code: "premium",
      status: "active",
      period_end: existingEnd.toISOString(),
      source: "sepay",
    });

    state.orders.set("ord-renew", {
      id: "ord-renew",
      user_id: "user-renew",
      plan_code: "premium",
      period: "month", // +30 ngày
      amount: 39000,
      currency: "VND",
      status: "pending",
      provider: "sepay",
      provider_ref: null,
      payment_code: "MQRENEW234",
      created_at: now.toISOString(),
      paid_at: null,
      expires_at: "2026-11-16T00:00:00.000Z",
    });

    // Kích hoạt lần 1: phải cộng 30 ngày vào existingEnd (2026-11-24 + 30 ngày = 2026-12-24)
    const firstAct = executeActivateSubscriptionFromOrder(
      state,
      "ord-renew",
      now
    );
    expect(firstAct.ok).toBe(true);
    expect(firstAct.idempotent).toBe(false);
    expect(firstAct.periodEnd).toBe("2026-12-24T00:00:00.000Z");

    // Kích hoạt lần 2 trên cùng đơn: idempotent = true, KHÔNG cộng thêm ngày nữa
    const secondAct = executeActivateSubscriptionFromOrder(
      state,
      "ord-renew",
      now
    );
    expect(secondAct.ok).toBe(true);
    expect(secondAct.idempotent).toBe(true);
    expect(secondAct.status).toBe("already_paid");

    const activeSubs = state.subscriptions.filter(
      (s) => s.user_id === "user-renew" && s.status === "active"
    );
    expect(activeSubs).toHaveLength(1);
    expect(activeSubs[0]!.period_end).toBe("2026-12-24T00:00:00.000Z");
  });

  it("11. Route POST /api/payments/webhook/sepay xác thực Apikey và gọi RPC process_sepay_webhook_event", async () => {
    const rpcSpy = vitest.fn().mockResolvedValue({
      data: { ok: true, status: "processed" },
      error: null,
    });

    vitest.doMock("@/lib/supabase/server", () => ({
      createServerSupabaseClient: async () => ({
        rpc: rpcSpy,
      }),
    }));

    const originalKey = process.env.SEPAY_WEBHOOK_API_KEY;
    process.env.SEPAY_WEBHOOK_API_KEY = SECRET_KEY;

    try {
      const { POST } = await import("@/app/api/payments/webhook/sepay/route");

      // Sai key -> 401
      const badReq = new NextRequest(
        "http://localhost:3000/api/payments/webhook/sepay",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Apikey invalid_key",
          },
          body: JSON.stringify({
            id: 5001,
            transferType: "in",
            transferAmount: 39000,
            content: "MQK7M9P2X4",
          }),
        }
      );
      const badRes = await POST(badReq);
      expect(badRes.status).toBe(401);

      // Đúng key -> 200 {"success": true}
      const goodReq = new NextRequest(
        "http://localhost:3000/api/payments/webhook/sepay",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Apikey ${SECRET_KEY}`,
          },
          body: JSON.stringify({
            id: 5002,
            transferType: "in",
            transferAmount: 39000,
            content: "CHUYEN KHOAN mq k7m9p2x4",
          }),
        }
      );
      const goodRes = await POST(goodReq);
      expect(goodRes.status).toBe(200);
      expect(await goodRes.json()).toEqual({ success: true });
      expect(rpcSpy).toHaveBeenCalledWith(
        "process_sepay_webhook_event",
        expect.objectContaining({
          p_event_id: "5002",
          p_transfer_type: "in",
          p_transfer_amount: 39000,
          p_payment_code: "MQK7M9P2X4",
        })
      );
    } finally {
      process.env.SEPAY_WEBHOOK_API_KEY = originalKey;
      vitest.resetModules();
    }
  });
});
