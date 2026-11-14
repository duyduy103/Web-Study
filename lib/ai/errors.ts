import { vi } from "@/lib/i18n/vi";

export type AiErrorCode =
  | "invalid_key"
  | "model_unavailable"
  | "quota"
  | "payload_too_large"
  | "schema_rejected"
  | "app_limit"
  | "invalid_request"
  | "unknown";

export interface ClassifiedAiError {
  code: AiErrorCode;
  message: string;
  httpStatus: number;
  originalCode: string;
  retryable: boolean;
}

export class AiClassifiedError extends Error {
  readonly code: AiErrorCode;
  readonly httpStatus: number;
  readonly originalCode: string;
  readonly retryable: boolean;

  constructor(params: ClassifiedAiError) {
    super(params.message);
    this.name = "AiClassifiedError";
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.originalCode = params.originalCode;
    this.retryable = params.retryable;
  }
}

function extractRawStatusAndMessage(err: unknown): {
  status?: number;
  rawCode?: string;
  rawMessage: string;
} {
  if (!err) {
    return { rawMessage: "" };
  }

  if (typeof err === "object") {
    const obj = err as {
      status?: number;
      httpStatus?: number;
      code?: string | number;
      originalCode?: string;
      message?: string;
      error?: {
        code?: number | string;
        status?: string;
        message?: string;
      };
    };

    const status =
      typeof obj.status === "number"
        ? obj.status
        : typeof obj.httpStatus === "number"
          ? obj.httpStatus
          : typeof obj.error?.code === "number"
            ? obj.error.code
            : undefined;

    const rawCode =
      typeof obj.originalCode === "string"
        ? obj.originalCode
        : typeof obj.error?.status === "string"
          ? obj.error.status
          : obj.code !== undefined
            ? String(obj.code)
            : undefined;

    const rawMessage =
      typeof obj.message === "string"
        ? obj.message
        : typeof obj.error?.message === "string"
          ? obj.error.message
          : String(err);

    return { status, rawCode, rawMessage };
  }

  return { rawMessage: String(err) };
}

/**
 * Phân loại mọi lỗi từ route, hạn mức ứng dụng, hoặc Gemini SDK sang 8 mã chuẩn:
 * invalid_key | model_unavailable | quota | payload_too_large | schema_rejected | app_limit | invalid_request | unknown
 * Tuyệt đối không đưa khóa API hay nội dung tài liệu vào thông báo hoặc mã log.
 */
export function classifyAiError(err: unknown): ClassifiedAiError {
  if (err instanceof AiClassifiedError) {
    return {
      code: err.code,
      message: err.message,
      httpStatus: err.httpStatus,
      originalCode: err.originalCode,
      retryable: err.retryable,
    };
  }

  const { status, rawCode, rawMessage } = extractRawStatusAndMessage(err);
  const lower = rawMessage.toLowerCase();
  const upperCode = (rawCode ?? "").toUpperCase();

  // 1. Lỗi Schema / JSON từ phản hồi AI
  if (
    rawMessage === vi.ai.invalidSchemaError ||
    err instanceof SyntaxError ||
    upperCode === "SCHEMA_REJECTED" ||
    lower.includes("phản hồi từ ai không đúng cấu trúc") ||
    lower.includes("unexpected token") ||
    lower.includes("json")
  ) {
    return {
      code: "schema_rejected",
      message: vi.ai.invalidSchemaError,
      httpStatus: 422,
      originalCode: rawCode ?? "SCHEMA_VALIDATION_FAILED",
      retryable: true,
    };
  }

  // 2. Lỗi Khóa API (invalid_key)
  if (
    rawMessage === vi.ai.missingApiKey ||
    status === 401 ||
    status === 403 ||
    upperCode === "API_KEY_INVALID" ||
    upperCode === "INVALID_KEY" ||
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("api key expired") ||
    lower.includes("unauthenticated") ||
    lower.includes("permission_denied") ||
    lower.includes("chưa cấu hình khóa gemini_api_key")
  ) {
    return {
      code: "invalid_key",
      message:
        rawMessage === vi.ai.missingApiKey
          ? vi.ai.missingApiKey
          : vi.ai.errors.invalidKey,
      httpStatus: 400,
      originalCode: rawCode ?? (status ? `HTTP_${status}` : "API_KEY_INVALID"),
      retryable: false,
    };
  }

  // 3. Lỗi Hạn mức AI / Rate limit (quota)
  if (
    rawMessage === vi.ai.quotaExhausted ||
    rawMessage === vi.ai.globalQuotaExhausted ||
    rawMessage === vi.ai.errors.accountBlocked ||
    status === 429 ||
    upperCode === "RESOURCE_EXHAUSTED" ||
    upperCode === "QUOTA_EXCEEDED" ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("hết lượt ai hôm nay") ||
    lower.includes("lượt ai hôm nay") ||
    lower.includes("tạm đạt giới hạn hôm nay")
  ) {
    const isAppQuotaMsg =
      rawMessage === vi.ai.quotaExhausted ||
      rawMessage === vi.ai.globalQuotaExhausted ||
      rawMessage === vi.ai.errors.accountBlocked ||
      lower.includes("lượt ai hôm nay");
    return {
      code: "quota",
      message: isAppQuotaMsg ? rawMessage : vi.ai.errors.quota,
      httpStatus: 429,
      originalCode:
        rawCode ?? (status ? `HTTP_${status}` : "RESOURCE_EXHAUSTED"),
      retryable: false,
    };
  }

  // 4. Lỗi Kích thước tệp / payload quá lớn (payload_too_large)
  if (
    rawMessage === vi.importSet.validation.fileTooLarge ||
    rawMessage.startsWith(vi.limits.fileTooLargePrefix) ||
    lower.includes("được tải tệp tối đa") ||
    status === 413 ||
    upperCode === "PAYLOAD_TOO_LARGE" ||
    lower.includes("payload size exceeds") ||
    lower.includes("request entity too large") ||
    lower.includes("too large") ||
    lower.includes("file vượt quá giới hạn")
  ) {
    const isVietnameseSizeMsg =
      rawMessage === vi.importSet.validation.fileTooLarge ||
      rawMessage.startsWith(vi.limits.fileTooLargePrefix) ||
      lower.includes("được tải tệp tối đa");
    return {
      code: "payload_too_large",
      message: isVietnameseSizeMsg
        ? rawMessage
        : vi.ai.errors.payloadTooLarge,
      httpStatus: 413,
      originalCode:
        rawCode ?? (status ? `HTTP_${status}` : "PAYLOAD_TOO_LARGE"),
      retryable: false,
    };
  }

  // 5. Lỗi Giới hạn theo vai trò / gói của ứng dụng (app_limit)
  if (
    rawMessage.startsWith(vi.limits.maxSetsReachedPrefix) ||
    rawMessage.startsWith(vi.limits.pdfTooManyPagesPrefix) ||
    rawMessage.startsWith(vi.limits.storageQuotaExceededPrefix) ||
    rawMessage.startsWith(vi.plans.dailySetLimitPrefix) ||
    rawMessage.startsWith(vi.plans.maxQuestionsPerSetPrefix) ||
    rawMessage.startsWith(vi.parsing.pdfTooManyPagesPrefix) ||
    rawMessage.startsWith("Gói miễn phí") ||
    rawMessage.startsWith("Gói Premium") ||
    upperCode === "APP_LIMIT"
  ) {
    return {
      code: "app_limit",
      message: rawMessage || vi.ai.errors.appLimit,
      httpStatus: 400,
      originalCode: rawCode ?? "APP_LIMIT_EXCEEDED",
      retryable: false,
    };
  }

  // 5b. Lỗi hệ thống fail-closed khi kiểm tra hạn mức
  if (rawMessage === vi.limits.systemErrorFailClosed) {
    return {
      code: "unknown",
      message: vi.limits.systemErrorFailClosed,
      httpStatus: 503,
      originalCode: "LIMIT_CHECK_FAIL_CLOSED",
      retryable: true,
    };
  }

  // 6. Lỗi Model không khả dụng hoặc quá tải (model_unavailable)
  if (
    status === 404 ||
    status === 503 ||
    upperCode === "NOT_FOUND" ||
    upperCode === "UNAVAILABLE" ||
    upperCode === "MODEL_UNAVAILABLE" ||
    lower.includes("models/") && lower.includes("not found") ||
    lower.includes("is not found for api version") ||
    lower.includes("is not supported for generatecontent") ||
    lower.includes("currently experiencing high demand") ||
    lower.includes("overloaded") ||
    lower.includes("model is overloaded") ||
    lower.includes('"status":"unavailable"') ||
    lower.includes('"status":"not_found"')
  ) {
    const is503 =
      status === 503 ||
      upperCode === "UNAVAILABLE" ||
      lower.includes("high demand") ||
      lower.includes("overloaded") ||
      lower.includes('"status":"unavailable"');
    return {
      code: "model_unavailable",
      message: vi.ai.errors.modelUnavailable,
      httpStatus: is503 ? 503 : 400,
      originalCode:
        rawCode ?? (status ? `HTTP_${status}` : is503 ? "UNAVAILABLE" : "MODEL_NOT_FOUND"),
      retryable: is503,
    };
  }

  // 7. Lỗi Yêu cầu không hợp lệ (invalid_request)
  if (
    rawMessage === vi.importSet.validation.sourceRequired ||
    rawMessage === vi.parsing.unsupportedFileType ||
    rawMessage === vi.parsing.emptyContent ||
    status === 400 ||
    upperCode === "INVALID_ARGUMENT" ||
    upperCode === "INVALID_REQUEST" ||
    lower.includes("invalid_argument") ||
    lower.includes("unable to process input") ||
    lower.includes("unsupported mime type") ||
    lower.includes("document has no pages")
  ) {
    const isVietnameseValidationMsg =
      rawMessage === vi.importSet.validation.sourceRequired ||
      rawMessage === vi.parsing.unsupportedFileType ||
      rawMessage === vi.parsing.emptyContent;
    return {
      code: "invalid_request",
      message: isVietnameseValidationMsg
        ? rawMessage
        : vi.ai.errors.invalidRequest,
      httpStatus: 400,
      originalCode:
        rawCode ?? (status ? `HTTP_${status}` : "INVALID_ARGUMENT"),
      retryable: false,
    };
  }

  // 8. Lỗi không xác định / mạng / timeout (unknown)
  return {
    code: "unknown",
    message:
      rawMessage === vi.ai.timeoutError
        ? vi.ai.timeoutError
        : vi.ai.callFailed,
    httpStatus: 500,
    originalCode:
      rawCode ??
      (rawMessage === vi.ai.timeoutError
        ? "TIMEOUT"
        : status
          ? `HTTP_${status}`
          : "UNKNOWN_ERROR"),
    retryable: true,
  };
}

