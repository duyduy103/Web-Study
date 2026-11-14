#!/usr/bin/env node
/**
 * Công cụ giả lập Webhook SePay tại local / staging:
 * Cách chạy:
 *   npm run payments:simulate -- <payment_code> <amount> [--event-id=999123] [--type=in]
 *
 * Ví dụ:
 *   npm run payments:simulate -- MQK7M9P2X4 39000
 */

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const positional = args.filter((arg) => !arg.startsWith("--"));
const flags = Object.fromEntries(
  args
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [k, v] = arg.slice(2).split("=");
      return [k, v ?? "true"];
    })
);

const paymentCode = positional[0];
const rawAmount = positional[1];

if (!paymentCode || !rawAmount || Number.isNaN(Number(rawAmount))) {
  console.error(
    "Cách dùng: npm run payments:simulate -- <payment_code> <amount> [--event-id=123456] [--type=in]"
  );
  console.error("Ví dụ:    npm run payments:simulate -- MQK7M9P2X4 39000");
  process.exit(1);
}

const apiKey = (process.env.SEPAY_WEBHOOK_API_KEY || "").trim();
if (!apiKey) {
  console.error(
    "Lỗi: Thiếu biến môi trường SEPAY_WEBHOOK_API_KEY trong file .env"
  );
  process.exit(1);
}

const baseUrl = (
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
).replace(/\/+$/, "");
const webhookUrl = `${baseUrl}/api/payments/webhook/sepay`;

const eventId = flags["event-id"]
  ? Number(flags["event-id"]) || flags["event-id"]
  : Math.floor(Date.now() / 1000);
const transferType = flags["type"] || "in";
const transferAmount = Math.round(Number(rawAmount));

const payload = {
  id: eventId,
  gateway: process.env.BANK_NAME || process.env.BANK_CODE || "MBBank",
  transactionDate: new Date().toISOString().replace("T", " ").slice(0, 19),
  accountNumber: process.env.BANK_ACCOUNT_NUMBER || "0123456789",
  code: paymentCode,
  content: `CHUYEN KHOAN ${paymentCode} THANH TOAN MEMOQUIZ`,
  transferType,
  transferAmount,
  accumulated: transferAmount,
  subAccount: null,
  referenceCode: `SIM-${eventId}`,
  description: `GD gia lap SePay cho ma ${paymentCode}`,
};

console.log(`[payments:simulate] Đang gửi webhook tới: ${webhookUrl}`);
console.log(
  `[payments:simulate] Event ID: ${eventId} | Mã đơn: ${paymentCode} | Số tiền: ${transferAmount.toLocaleString("vi-VN")} VND | Loại: ${transferType}`
);

try {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Apikey ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  console.log(`[payments:simulate] HTTP Status: ${response.status}`);
  console.log(`[payments:simulate] Phản hồi: ${bodyText}`);

  if (!response.ok) {
    process.exit(1);
  }
} catch (err) {
  console.error(
    "[payments:simulate] Không thể kết nối tới server:",
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
}

