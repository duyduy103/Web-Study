import crypto from "node:crypto";
import { z } from "zod";
import type {
  Json,
  OrderPeriod,
  OrderStatus,
  PaymentEventStatus,
  PlanCatalogItem,
} from "@/lib/supabase/types";

// Bảng chữ cái 32 ký tự viết HOA và số, loại bỏ 0, O, 1, I để tránh nhầm lẫn khi đọc/nhập tay
export const UNAMBIGUOUS_PAYMENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAYMENT_CODE_RANDOM_LENGTH = 8;
export const ORDER_EXPIRY_HOURS = 48;

export interface BankTransferConfig {
  bankCode: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  paymentCodePrefix: string;
  isConfigured: boolean;
}

export function getPaymentCodePrefix(rawPrefix?: string | null): string {
  const source = rawPrefix ?? process.env.PAYMENT_CODE_PREFIX ?? "MQ";
  const cleaned = source.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return cleaned.length > 0 ? cleaned.slice(0, 8) : "MQ";
}

export function getBankConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): BankTransferConfig {
  const bankCode = (env.BANK_CODE ?? "").trim();
  const bankName = (env.BANK_NAME ?? "").trim() || bankCode;
  const bankAccountNumber = (env.BANK_ACCOUNT_NUMBER ?? "").trim();
  const bankAccountName = (env.BANK_ACCOUNT_NAME ?? "").trim();
  const paymentCodePrefix = getPaymentCodePrefix(env.PAYMENT_CODE_PREFIX);

  return {
    bankCode,
    bankName,
    bankAccountNumber,
    bankAccountName,
    paymentCodePrefix,
    isConfigured: Boolean(bankCode && bankAccountNumber && bankAccountName),
  };
}

/**
 * Sinh payment_code duy nhất: PAYMENT_CODE_PREFIX + 8 ký tự ngẫu nhiên không dễ nhầm (bỏ 0/O/1/I).
 * Không có khoảng trắng hay ký tự đặc biệt.
 */
export function generatePaymentCode(prefix?: string): string {
  const cleanPrefix = getPaymentCodePrefix(prefix);
  let randomPart = "";
  for (let i = 0; i < PAYMENT_CODE_RANDOM_LENGTH; i++) {
    const idx = crypto.randomInt(0, UNAMBIGUOUS_PAYMENT_CODE_ALPHABET.length);
    randomPart += UNAMBIGUOUS_PAYMENT_CODE_ALPHABET[idx];
  }
  return `${cleanPrefix}${randomPart}`;
}

/**
 * Tạo URL ảnh QR VietQR từ SePay bằng URLSearchParams
 * https://qr.sepay.vn/img?acc={BANK_ACCOUNT_NUMBER}&bank={BANK_CODE}&amount={amount}&des={payment_code}
 */
export function buildSepayQrUrl(params: {
  bankAccountNumber: string;
  bankCode: string;
  amount: number;
  paymentCode: string;
}): string {
  const searchParams = new URLSearchParams({
    acc: params.bankAccountNumber.trim(),
    bank: params.bankCode.trim(),
    amount: String(Math.round(params.amount)),
    des: params.paymentCode.trim().toUpperCase(),
  });
  return `https://qr.sepay.vn/img?${searchParams.toString()}`;
}

/**
 * Tính giá đơn hàng trên server từ bảng plans.prices.
 * Tuyệt đối không nhận số tiền từ client.
 */
export function calculateServerOrderPrice(
  plan: Pick<PlanCatalogItem, "code" | "active" | "prices" | "period_days"> | null | undefined,
  period: OrderPeriod
): { amount: number; periodDays: number } {
  if (!plan || !plan.active) {
    throw new Error("Gói dịch vụ không tồn tại hoặc đang tạm ngưng.");
  }
  if (period !== "month" && period !== "year") {
    throw new Error("Chu kỳ thanh toán không hợp lệ.");
  }

  const rawPrice = plan.prices?.[period];
  const amount = typeof rawPrice === "number" ? Math.round(rawPrice) : Number(rawPrice);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Gói dịch vụ này không có mức giá cho chu kỳ đã chọn.");
  }

  const rawDays = plan.period_days?.[period];
  const periodDays =
    typeof rawDays === "number" && rawDays > 0
      ? Math.round(rawDays)
      : period === "year"
      ? 365
      : 30;

  return { amount, periodDays };
}

/**
 * Xác thực header Authorization dạng "Apikey <key>" với SEPAY_WEBHOOK_API_KEY
 * bằng so sánh hằng thời gian (timingSafeEqual). Không bao giờ ghi key ra log.
 */
export function verifySepayWebhookAuth(
  authHeader: string | null | undefined,
  expectedApiKey: string | null | undefined
): boolean {
  const expected = (expectedApiKey ?? "").trim();
  if (!expected || !authHeader) {
    return false;
  }

  const match = authHeader.trim().match(/^Apikey\s+(.+)$/i);
  if (!match || !match[1]) {
    return false;
  }

  const provided = match[1].trim();
  if (!provided) {
    return false;
  }

  const providedHash = crypto.createHash("sha256").update(provided, "utf8").digest();
  const expectedHash = crypto.createHash("sha256").update(expected, "utf8").digest();

  const hashesMatch = crypto.timingSafeEqual(providedHash, expectedHash);
  return hashesMatch && provided.length === expected.length;
}

/**
 * Schema payload SePay bằng Zod (chấp nhận trường thừa qua .passthrough())
 */
export const sepayWebhookPayloadSchema = z
  .object({
    id: z.union([z.number().int(), z.string().min(1)]),
    gateway: z.string().nullable().optional(),
    transactionDate: z.string().nullable().optional(),
    accountNumber: z.string().nullable().optional(),
    code: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    transferType: z.string().min(1),
    transferAmount: z.number().nonnegative(),
    accumulated: z.number().nullable().optional(),
    subAccount: z.string().nullable().optional(),
    referenceCode: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .passthrough();

export type SepayWebhookPayload = z.infer<typeof sepayWebhookPayloadSchema>;

/**
 * Lược bỏ các trường thừa không cần thiết trước khi lưu vào payment_events.payload
 */
export function sanitizeSepayPayload(payload: SepayWebhookPayload): Record<string, Json> {
  return {
    id: String(payload.id),
    gateway: payload.gateway ?? null,
    transactionDate: payload.transactionDate ?? null,
    accountNumber: payload.accountNumber ?? null,
    code: payload.code ?? null,
    content: payload.content ?? null,
    transferType: payload.transferType,
    transferAmount: payload.transferAmount,
    referenceCode: payload.referenceCode ?? null,
    subAccount: payload.subAccount ?? null,
  };
}

/**
 * Tách payment_code từ trường `code` hoặc tìm bằng regex theo PAYMENT_CODE_PREFIX trong `content`.
 * Không phân biệt hoa/thường, bỏ khoảng trắng/gạch nối giữa prefix và 8 ký tự mã.
 */
export function extractPaymentCodeFromWebhook(params: {
  code?: string | null;
  content?: string | null;
  description?: string | null;
  prefix?: string;
}): string | null {
  const prefix = getPaymentCodePrefix(params.prefix);
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // 1. Ưu tiên kiểm tra trường `code` do SePay bóc tách sẵn
  if (params.code && params.code.trim().length > 0) {
    const normalizedCode = params.code.replace(/[\s\-_]+/g, "").toUpperCase();
    const directRegex = new RegExp(`^(${escapedPrefix}[A-HJ-NP-Z2-9]{8})$`, "i");
    const directMatch = normalizedCode.match(directRegex);
    if (directMatch && directMatch[1]) {
      return directMatch[1].toUpperCase();
    }
    // Hỗ trợ nếu code chứa mã nằm trong chuỗi
    const subMatch = normalizedCode.match(
      new RegExp(`(${escapedPrefix}[A-HJ-NP-Z2-9]{8})`, "i")
    );
    if (subMatch && subMatch[1]) {
      return subMatch[1].toUpperCase();
    }
  }

  // 2. Tìm trong `content` (hoặc `description`) với regex theo PAYMENT_CODE_PREFIX
  const candidateTexts = [params.content, params.description].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0
  );

  // Cho phép khoảng trắng hoặc dấu gạch giữa prefix và 8 ký tự (ví dụ: "mq k7m9p2x4" hoặc "MQK7M9P2X4")
  const spacedRegex = new RegExp(
    `${escapedPrefix}[\\s\\-_]*([A-HJ-NP-Z2-9]{8})`,
    "i"
  );

  for (const text of candidateTexts) {
    const match = text.match(spacedRegex);
    if (match && match[1]) {
      return `${prefix}${match[1].toUpperCase()}`;
    }
  }

  return null;
}

/**
 * Mô hình xử lý nguyên tử trong bộ nhớ / tầng nghiệp vụ (dùng để kiểm thử đầy đủ
 * các nhánh idempotent, hết hạn 48h, lệch tiền, gia hạn nối tiếp và dự phòng khi cần).
 */
export interface OrderRecordForActivation {
  id: string;
  user_id: string;
  plan_code: string;
  period: OrderPeriod;
  amount: number;
  currency: string;
  status: OrderStatus;
  provider: string;
  provider_ref: string | null;
  payment_code: string;
  created_at: string;
  paid_at: string | null;
  expires_at: string;
}

export interface SubscriptionRecordForActivation {
  id: string;
  user_id: string;
  plan_code: string;
  status: "active" | "canceled" | "expired";
  period_end: string | null;
  source: string;
}

export interface InMemoryPaymentState {
  plans: Record<string, Pick<PlanCatalogItem, "code" | "name" | "active" | "prices" | "period_days">>;
  orders: Map<string, OrderRecordForActivation>;
  subscriptions: SubscriptionRecordForActivation[];
  paymentEvents: Map<
    string,
    {
      provider: string;
      event_id: string;
      status: PaymentEventStatus;
      reason: string | null;
      order_id: string | null;
      payload: Record<string, Json>;
    }
  >;
  notifications: Array<{
    user_id: string;
    type: string;
    title: string;
    body: string;
    dedupe_key: string;
  }>;
}

/**
 * Thực thi logic tương đương hàm SQL `activate_subscription_from_order(order_id)`:
 * - Chỉ kích hoạt khi đơn `pending` hoặc `expired` (KHÔNG kích hoạt `cancelled` / `refunded`)
 * - Idempotent: nếu đơn đã `paid` thì trả về `already_paid` và không cộng thêm ngày
 * - Gia hạn nối tiếp nếu đang có gói Premium còn hạn (cộng từ `period_end`)
 */
export function executeActivateSubscriptionFromOrder(
  state: InMemoryPaymentState,
  orderId: string,
  now: Date = new Date(),
  providerRef?: string | null
): {
  ok: boolean;
  idempotent: boolean;
  status: "activated" | "already_paid" | "not_activatable" | "order_not_found";
  periodEnd?: string | null;
  daysAdded?: number;
} {
  const order = state.orders.get(orderId);
  if (!order) {
    return { ok: false, idempotent: false, status: "order_not_found" };
  }

  if (order.status === "paid") {
    return {
      ok: true,
      idempotent: true,
      status: "already_paid",
    };
  }

  if (order.status === "cancelled" || order.status === "refunded") {
    return {
      ok: false,
      idempotent: false,
      status: "not_activatable",
    };
  }

  const plan = state.plans[order.plan_code];
  const rawDays = plan?.period_days?.[order.period];
  const days =
    typeof rawDays === "number" && rawDays > 0
      ? Math.round(rawDays)
      : order.period === "year"
      ? 365
      : 30;

  // Tìm subscription đang active và còn hạn của cùng gói
  const activeSub = state.subscriptions.find(
    (s) =>
      s.user_id === order.user_id &&
      s.plan_code === order.plan_code &&
      s.status === "active" &&
      (s.period_end === null || new Date(s.period_end).getTime() > now.getTime())
  );

  let newPeriodEnd: string | null;
  if (activeSub && activeSub.period_end === null) {
    newPeriodEnd = null;
  } else {
    const baseTimeMs =
      activeSub && activeSub.period_end
        ? Math.max(new Date(activeSub.period_end).getTime(), now.getTime())
        : now.getTime();
    newPeriodEnd = new Date(baseTimeMs + days * 86_400_000).toISOString();
  }

  // Hủy các subscription active cũ của user
  for (const sub of state.subscriptions) {
    if (sub.user_id === order.user_id && sub.status === "active") {
      sub.status = "canceled";
    }
  }

  order.status = "paid";
  order.paid_at = now.toISOString();
  if (providerRef) {
    order.provider_ref = providerRef;
  }

  state.subscriptions.push({
    id: `sub_${state.subscriptions.length + 1}`,
    user_id: order.user_id,
    plan_code: order.plan_code,
    status: "active",
    period_end: newPeriodEnd,
    source: order.provider || "sepay",
  });

  const dedupeKey = `order_paid_${order.id}`;
  if (
    !state.notifications.some(
      (n) => n.user_id === order.user_id && n.dedupe_key === dedupeKey
    )
  ) {
    state.notifications.push({
      user_id: order.user_id,
      type: "payment_confirmed",
      title: `Thanh toán thành công gói ${plan?.name ?? "Premium"}`,
      body: `Đơn hàng ${order.payment_code} đã được xác nhận.`,
      dedupe_key: dedupeKey,
    });
  }

  return {
    ok: true,
    idempotent: false,
    status: "activated",
    periodEnd: newPeriodEnd,
    daysAdded: days,
  };
}

/**
 * Xử lý trọn vẹn một request webhook SePay trên state (dùng cho test & kiểm증 nghiệp vụ):
 * - Kiểm tra Authorization header ("Apikey <key>")
 * - Kiểm tra schema Zod
 * - Chống xử lý trùng theo unique(provider, event_id)
 * - Bỏ qua transferType !== 'in'
 * - Tách payment_code từ `code` hoặc `content`
 * - Kiểm tra khớp số tiền & trạng thái đơn
 */
export function handleSepayWebhookInMemory(params: {
  state: InMemoryPaymentState;
  authHeader: string | null | undefined;
  expectedApiKey: string;
  rawBody: unknown;
  paymentCodePrefix?: string;
  now?: Date;
}): {
  httpStatus: number;
  body: { success: boolean; error?: string };
  outcome?: {
    duplicate?: boolean;
    eventStatus?: PaymentEventStatus;
    reason?: string;
    orderId?: string | null;
  };
} {
  if (!verifySepayWebhookAuth(params.authHeader, params.expectedApiKey)) {
    return {
      httpStatus: 401,
      body: { success: false, error: "Unauthorized" },
    };
  }

  const parsed = sepayWebhookPayloadSchema.safeParse(params.rawBody);
  if (!parsed.success) {
    return {
      httpStatus: 400,
      body: { success: false, error: "Invalid payload" },
    };
  }

  const payload = parsed.data;
  const eventId = String(payload.id).trim();
  const eventKey = `sepay:${eventId}`;
  const now = params.now ?? new Date();

  // 1. Chống xử lý trùng: nếu event_id đã tồn tại thì trả 200 {"success": true} và không làm gì thêm
  if (params.state.paymentEvents.has(eventKey)) {
    return {
      httpStatus: 200,
      body: { success: true },
      outcome: { duplicate: true },
    };
  }

  const sanitized = sanitizeSepayPayload(payload);

  // 2. Chỉ xử lý giao dịch tiền vào (transferType = 'in')
  if (payload.transferType.trim().toLowerCase() !== "in") {
    params.state.paymentEvents.set(eventKey, {
      provider: "sepay",
      event_id: eventId,
      status: "ignored",
      reason: "transfer_out",
      order_id: null,
      payload: sanitized,
    });
    return {
      httpStatus: 200,
      body: { success: true },
      outcome: {
        duplicate: false,
        eventStatus: "ignored",
        reason: "transfer_out",
      },
    };
  }

  // 3. Tách payment_code từ `code` hoặc `content`
  const paymentCode = extractPaymentCodeFromWebhook({
    code: payload.code,
    content: payload.content,
    description: payload.description,
    prefix: params.paymentCodePrefix,
  });

  if (!paymentCode) {
    params.state.paymentEvents.set(eventKey, {
      provider: "sepay",
      event_id: eventId,
      status: "needs_review",
      reason: "missing_payment_code",
      order_id: null,
      payload: sanitized,
    });
    return {
      httpStatus: 200,
      body: { success: true },
      outcome: {
        duplicate: false,
        eventStatus: "needs_review",
        reason: "missing_payment_code",
      },
    };
  }

  // Tìm đơn hàng theo payment_code
  const matchedOrder = Array.from(params.state.orders.values()).find(
    (o) => o.payment_code.toUpperCase() === paymentCode.toUpperCase()
  );

  if (!matchedOrder) {
    params.state.paymentEvents.set(eventKey, {
      provider: "sepay",
      event_id: eventId,
      status: "needs_review",
      reason: "order_not_found",
      order_id: null,
      payload: sanitized,
    });
    return {
      httpStatus: 200,
      body: { success: true },
      outcome: {
        duplicate: false,
        eventStatus: "needs_review",
        reason: "order_not_found",
      },
    };
  }

  // Tự cập nhật trạng thái expired nếu quá 48h (nhưng đơn expired vẫn được kích hoạt nếu tiền về đủ!)
  if (
    matchedOrder.status === "pending" &&
    new Date(matchedOrder.expires_at).getTime() <= now.getTime()
  ) {
    matchedOrder.status = "expired";
  }

  if (matchedOrder.status === "paid") {
    params.state.paymentEvents.set(eventKey, {
      provider: "sepay",
      event_id: eventId,
      status: "needs_review",
      reason: "order_already_paid",
      order_id: matchedOrder.id,
      payload: sanitized,
    });
    return {
      httpStatus: 200,
      body: { success: true },
      outcome: {
        duplicate: false,
        eventStatus: "needs_review",
        reason: "order_already_paid",
        orderId: matchedOrder.id,
      },
    };
  }

  if (matchedOrder.status === "cancelled" || matchedOrder.status === "refunded") {
    params.state.paymentEvents.set(eventKey, {
      provider: "sepay",
      event_id: eventId,
      status: "needs_review",
      reason: "order_not_activatable",
      order_id: matchedOrder.id,
      payload: sanitized,
    });
    return {
      httpStatus: 200,
      body: { success: true },
      outcome: {
        duplicate: false,
        eventStatus: "needs_review",
        reason: "order_not_activatable",
        orderId: matchedOrder.id,
      },
    };
  }

  if (Math.round(payload.transferAmount) !== matchedOrder.amount) {
    params.state.paymentEvents.set(eventKey, {
      provider: "sepay",
      event_id: eventId,
      status: "needs_review",
      reason: "amount_mismatch",
      order_id: matchedOrder.id,
      payload: sanitized,
    });
    return {
      httpStatus: 200,
      body: { success: true },
      outcome: {
        duplicate: false,
        eventStatus: "needs_review",
        reason: "amount_mismatch",
        orderId: matchedOrder.id,
      },
    };
  }

  // Đủ điều kiện kích hoạt
  params.state.paymentEvents.set(eventKey, {
    provider: "sepay",
    event_id: eventId,
    status: "processed",
    reason: "matched",
    order_id: matchedOrder.id,
    payload: sanitized,
  });

  executeActivateSubscriptionFromOrder(
    params.state,
    matchedOrder.id,
    now,
    payload.referenceCode ?? eventId
  );

  return {
    httpStatus: 200,
    body: { success: true },
    outcome: {
      duplicate: false,
      eventStatus: "processed",
      reason: "matched",
      orderId: matchedOrder.id,
    },
  };
}

