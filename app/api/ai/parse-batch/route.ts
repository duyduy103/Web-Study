import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import { enforceAccountImportLimits } from "@/lib/limits";
import { vi } from "@/lib/i18n/vi";
import { runAiExtractBatch } from "@/lib/ai/tasks";
import { validateAndReadSource } from "@/lib/sets/import-service";

const parseBatchMetaSchema = z.object({
  mode: z.enum(["whole", "fix_low_confidence"]),
  contextHint: z.string().max(200).optional(),
  batchText: z.string().optional(),
});

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

    const metaParsed = parseBatchMetaSchema.safeParse({
      mode: formData.get("mode") ?? "whole",
      contextHint: formData.get("contextHint") || undefined,
      batchText: formData.get("batchText") || undefined,
    });

    if (!metaParsed.success) {
      return NextResponse.json(
        { error: vi.ai.callFailed },
        { status: 400 }
      );
    }

    const { mode, contextHint, batchText } = metaParsed.data;

    // Trường hợp gửi lô văn bản câu hỏi cần sửa (fix_low_confidence) hoặc văn bản thuần
    if (batchText && batchText.trim().length > 0) {
      const result = await runAiExtractBatch({
        supabase,
        userId: user.id,
        rawText: batchText.trim(),
        contextHint,
        mode,
      });

      return NextResponse.json(result);
    }

    // Trường hợp gửi file gốc (PDF / Ảnh / Word)
    const fileEntry = formData.get("file");
    const file = fileEntry instanceof File ? fileEntry : null;
    const pastedTextEntry = formData.get("pastedText");
    const pastedText =
      typeof pastedTextEntry === "string" ? pastedTextEntry : null;

    const source = await validateAndReadSource(file, pastedText);
    await enforceAccountImportLimits({
      supabase,
      userId: user.id,
      role,
      newFileSizeBytes: source.buffer.byteLength,
    });

    const isMediaFile =
      source.mimeType === "application/pdf" ||
      source.mimeType === "image/png" ||
      source.mimeType === "image/jpeg";

    if (isMediaFile) {
      const result = await runAiExtractBatch({
        supabase,
        userId: user.id,
        media: {
          mimeType: source.mimeType,
          base64Data: source.buffer.toString("base64"),
        },
        contextHint,
        mode: "whole",
      });

      return NextResponse.json(result);
    }

    const result = await runAiExtractBatch({
      supabase,
      userId: user.id,
      rawText: source.textForDirectParse ?? source.buffer.toString("utf-8"),
      contextHint,
      mode,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : vi.ai.callFailed;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

