#!/usr/bin/env node
/**
 * Script kiểm tra danh sách model Gemini khả dụng và xác minh GEMINI_MODEL_FAST & GEMINI_MODEL_STRONG.
 * Không in khóa API ra console.
 * Cách chạy: npm run ai:models
 */
import { GoogleGenAI } from "@google/genai";

async function checkModels() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "Thiếu GEMINI_API_KEY trong file .env. Hãy cấu hình trước khi chạy: npm run ai:models"
    );
    process.exit(1);
  }

  const fastModel = (process.env.GEMINI_MODEL_FAST || "").trim();
  const strongModel = (process.env.GEMINI_MODEL_STRONG || "").trim();

  console.log("=== KIỂM TRA CẤU HÌNH MODEL GEMINI ===");
  console.log(`- GEMINI_MODEL_FAST   = ${fastModel || "(trống)"}`);
  console.log(`- GEMINI_MODEL_STRONG = ${strongModel || "(trống)"}`);

  const ai = new GoogleGenAI({ apiKey });
  const availableNames = new Set();
  const availableFlashModels = [];

  try {
    const pager = await ai.models.list();
    for await (const m of pager) {
      const rawName = m.name || "";
      const shortName = rawName.replace(/^models\//, "");
      if (shortName) {
        availableNames.add(shortName);
        availableNames.add(rawName);
        if (
          shortName.includes("gemini") &&
          (!m.supportedActions ||
            m.supportedActions.includes("generateContent"))
        ) {
          availableFlashModels.push({
            name: shortName,
            displayName: m.displayName || "",
          });
        }
      }
    }
  } catch (err) {
    console.error("[ai:models] Lỗi khi gọi danh sách models từ Gemini:");
    console.error("- Status / Code:", err?.status ?? err?.code ?? "N/A");
    console.error("- Message gốc:", err?.message ?? String(err));
    process.exit(1);
  }

  const fastExists = Boolean(fastModel && availableNames.has(fastModel));
  const strongExists = Boolean(strongModel && availableNames.has(strongModel));

  console.log("\n=== KẾT QUẢ XÁC MINH MODEL TRONG .ENV ===");
  console.log(
    `- GEMINI_MODEL_FAST (${fastModel}): ${
      fastExists ? "TỒN TẠI (OK)" : "⚠️ KHÔNG TỒN TẠI / CHƯA DÙNG ĐƯỢC (404 NOT_FOUND)"
    }`
  );
  console.log(
    `- GEMINI_MODEL_STRONG (${strongModel}): ${
      strongExists ? "TỒN TẠI (OK)" : "⚠️ KHÔNG TỒN TẠI / CHƯA DÙNG ĐƯỢC (404 NOT_FOUND)"
    }`
  );

  console.log("\n=== CÁC MODEL GEMINI KHẢ DỤNG GỢI Ý ===");
  console.table(
    availableFlashModels
      .filter((m) => /gemini-(2\.5|3)/i.test(m.name))
      .slice(0, 20)
  );

  if (!fastExists || !strongExists) {
    console.warn(
      "\n[CẢNH BÁO CẤU HÌNH] Một hoặc cả hai biến GEMINI_MODEL_FAST / GEMINI_MODEL_STRONG trong .env không tồn tại trên Gemini API!"
    );
    process.exitCode = 2;
  }
}

checkModels();

