import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { enforceAccountImportLimits } from "@/lib/limits";
import { vi } from "@/lib/i18n/vi";
import {
  importQuestionSetToDatabase,
  validateAndReadSource,
} from "@/lib/sets/import-service";
import {
  importMetadataSchema,
  parsedQuestionInputSchema,
  spreadsheetMappingSchema,
} from "@/lib/sets/schemas";
import type {
  ParsedQuestion,
  SpreadsheetColumnMapping,
} from "@/lib/parsing";

const preParsedArraySchema = z.array(parsedQuestionInputSchema);

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

    const rawMeta: unknown = {
      title: formData.get("title") ?? "",
      subject: formData.get("subject") ?? undefined,
      grade: formData.get("grade") ?? undefined,
      overrideFormat: formData.get("overrideFormat") || undefined,
      forceDuplicate: formData.get("forceDuplicate") === "true",
    };

    const parsedMeta = importMetadataSchema.safeParse(rawMeta);
    if (!parsedMeta.success) {
      const firstError =
        parsedMeta.error.issues[0]?.message ??
        vi.importSet.validation.titleRequired;
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const fileEntry = formData.get("file");
    const file = fileEntry instanceof File ? fileEntry : null;
    const pastedTextEntry = formData.get("pastedText");
    const pastedText =
      typeof pastedTextEntry === "string" ? pastedTextEntry : null;

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
        // Dùng tự động đoán cột mặc định
      }
    }

    const preParsedRaw = formData.get("preParsedQuestions");
    let preParsedQuestions: ParsedQuestion[] | undefined;
    if (typeof preParsedRaw === "string" && preParsedRaw.length > 0) {
      try {
        const jsonParsed: unknown = JSON.parse(preParsedRaw);
        const validated = preParsedArraySchema.safeParse(jsonParsed);
        if (validated.success && validated.data.length > 0) {
          preParsedQuestions = validated.data;
        }
      } catch {
        // Nếu lỗi parse JSON thì tách lại từ nguồn
      }
    }

    const source = await validateAndReadSource(file, pastedText);
    await enforceAccountImportLimits({
      supabase,
      userId: user.id,
      role,
      newFileSizeBytes: source.buffer.byteLength,
    });

    const result = await importQuestionSetToDatabase({
      supabase,
      userId: user.id,
      title: parsedMeta.data.title,
      subject: parsedMeta.data.subject,
      grade: parsedMeta.data.grade,
      source,
      overrideFormat: parsedMeta.data.overrideFormat,
      columnMapping,
      forceDuplicate: parsedMeta.data.forceDuplicate,
      preParsedQuestions,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : vi.importSet.errors.saveFailed;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
