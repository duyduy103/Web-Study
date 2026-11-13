import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { enforceAccountImportLimits } from "@/lib/limits";
import { vi } from "@/lib/i18n/vi";
import { getUserAiQuotaStatus } from "@/lib/ai/quota-and-cache";
import {
  buildSourcePreview,
  validateAndReadSource,
} from "@/lib/sets/import-service";
import {
  documentFormatSchema,
  spreadsheetMappingSchema,
} from "@/lib/sets/schemas";
import type {
  DocumentFormat,
  SpreadsheetColumnMapping,
} from "@/lib/parsing";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const authProfile = await getAuthenticatedProfile(supabase);

    if (!authProfile) {
      return NextResponse.json(
        { error: vi.importSet.errors.unauthorized },
        { status: 401 }
      );
    }
    const { user, role } = authProfile;

    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const file = fileEntry instanceof File ? fileEntry : null;
    const pastedTextEntry = formData.get("pastedText");
    const pastedText =
      typeof pastedTextEntry === "string" ? pastedTextEntry : null;

    const overrideFormatRaw = formData.get("overrideFormat");
    let overrideFormat: DocumentFormat | undefined;
    if (typeof overrideFormatRaw === "string" && overrideFormatRaw.length > 0) {
      const parsedFmt = documentFormatSchema.safeParse(overrideFormatRaw);
      if (parsedFmt.success) {
        overrideFormat = parsedFmt.data;
      }
    }

    const mappingRaw = formData.get("columnMapping");
    let columnMapping: SpreadsheetColumnMapping | undefined;
    if (typeof mappingRaw === "string" && mappingRaw.length > 0) {
      try {
        const jsonParsed: unknown = JSON.parse(mappingRaw);
        const validated = spreadsheetMappingSchema.safeParse(jsonParsed);
        if (validated.success) {
          columnMapping = validated.data;
        }
      } catch {
        // Hệ thống sẽ tự đoán lại cột
      }
    }

    const [source, quotaStatus] = await Promise.all([
      validateAndReadSource(file, pastedText),
      getUserAiQuotaStatus(supabase, user.id, role),
    ]);

    await enforceAccountImportLimits({
      supabase,
      userId: user.id,
      role,
      newFileSizeBytes: source.buffer.byteLength,
    });

    const preview = await buildSourcePreview(source, {
      overrideFormat,
      columnMapping,
      remainingAiQuota: quotaStatus.remainingToday,
    });

    return NextResponse.json(preview);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : vi.importSet.errors.previewFailed;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
