import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { vi } from "@/lib/i18n/vi";
import {
  importQuestionSetToDatabase,
  validateAndReadSource,
} from "@/lib/sets/import-service";
import {
  importMetadataSchema,
  spreadsheetMappingSchema,
} from "@/lib/sets/schemas";
import type { SpreadsheetColumnMapping } from "@/lib/parsing";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: vi.importSet.errors.unauthorized },
        { status: 401 }
      );
    }

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

    const source = await validateAndReadSource(file, pastedText);
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
    });

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : vi.importSet.errors.saveFailed;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

