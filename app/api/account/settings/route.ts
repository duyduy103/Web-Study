import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile } from "@/lib/auth/roles";
import {
  hashLearnerTokenSha256,
  normalizeRecoveryCode,
} from "@/lib/srs/crypto-and-pomodoro";
import {
  strongPasswordSchema,
  isPasswordContainingEmail,
} from "@/lib/auth/password-rules";
import { vi } from "@/lib/i18n/vi";

const patchSettingsSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_profile"),
    displayName: z.string().trim().min(1).max(60),
  }),
  z.object({
    action: z.literal("switch_role"),
    targetRole: z.enum(["student", "teacher"]),
    confirmed: z.literal(true),
  }),
  z.object({
    action: z.literal("merge_anonymous"),
    recoveryCode: z.string().trim().min(6).max(32),
  }),
  z.object({
    action: z.literal("change_password"),
    currentPassword: z.string().min(1),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(1),
  }),
  z.object({
    action: z.literal("change_email"),
    newEmail: z.string().trim().email(),
  }),
  z.object({
    action: z.literal("logout_all"),
  }),
]);

const deleteAccountSchema = z.object({
  confirmKeyword: z.string().trim(),
});

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const authProfile = await getAuthenticatedProfile(supabase);
    if (!authProfile) {
      return NextResponse.json(
        { error: vi.importSet.errors.unauthorized },
        { status: 401 }
      );
    }

    const body: unknown = await request.json();
    const parsed = patchSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: vi.review.editor.errorStatus },
        { status: 400 }
      );
    }

    const input = parsed.data;

    if (input.action === "update_profile") {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: input.displayName })
        .eq("id", authProfile.user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await supabase
        .from("learners")
        .update({ nickname: input.displayName })
        .eq("user_id", authProfile.user.id);

      return NextResponse.json({
        displayName: input.displayName,
      });
    }

    if (input.action === "switch_role") {
      const { error } = await supabase
        .from("profiles")
        .update({ role: input.targetRole })
        .eq("id", authProfile.user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        role: input.targetRole,
      });
    }

    if (input.action === "change_password") {
      const email = authProfile.user.email ?? "";
      if (input.newPassword !== input.confirmPassword) {
        return NextResponse.json(
          { error: vi.auth.validation.passwordMismatch },
          { status: 400 }
        );
      }
      if (isPasswordContainingEmail(input.newPassword, email)) {
        return NextResponse.json(
          { error: vi.auth.validation.passwordContainsEmail },
          { status: 400 }
        );
      }

      // Xác thực mật khẩu cũ
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: input.currentPassword,
      });

      if (signInErr) {
        return NextResponse.json(
          { error: vi.settings.currentPasswordIncorrect },
          { status: 400 }
        );
      }

      // Đổi sang mật khẩu mới
      const { error: updateErr } = await supabase.auth.updateUser({
        password: input.newPassword,
      });

      if (updateErr) {
        return NextResponse.json(
          { error: updateErr.message },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        notice: vi.settings.passwordChangedNotice,
      });
    }

    if (input.action === "change_email") {
      const { error: updateErr } = await supabase.auth.updateUser({
        email: input.newEmail,
      });

      if (updateErr) {
        return NextResponse.json(
          { error: updateErr.message },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        notice: vi.settings.emailChangeSentNotice,
      });
    }

    if (input.action === "logout_all") {
      await supabase.auth.signOut({ scope: "others" });
      return NextResponse.json({
        ok: true,
        notice: vi.settings.logoutAllNotice,
      });
    }

    // action === "merge_anonymous"
    const normalized = normalizeRecoveryCode(input.recoveryCode);
    const recoveryHash = hashLearnerTokenSha256(normalized);

    const { data: raw, error } = await supabase.rpc("merge_anonymous_learner", {
      p_recovery_code_hash: recoveryHash,
    });

    if (error || !raw) {
      return NextResponse.json(
        { error: vi.settings.mergeInvalidCodeError },
        { status: 400 }
      );
    }

    const payload = raw as {
      error: string | null;
      merged_cards?: number;
      moved_logs?: number;
    };

    if (payload.error) {
      return NextResponse.json(
        { error: vi.settings.mergeInvalidCodeError },
        { status: 400 }
      );
    }

    return NextResponse.json({
      mergedCards: payload.merged_cards ?? 0,
      movedLogs: payload.moved_logs ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : vi.review.editor.errorStatus,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const authProfile = await getAuthenticatedProfile(supabase);
    if (!authProfile) {
      return NextResponse.json(
        { error: vi.importSet.errors.unauthorized },
        { status: 401 }
      );
    }

    const body: unknown = await request.json();
    const parsed = deleteAccountSchema.safeParse(body);
    if (
      !parsed.success ||
      parsed.data.confirmKeyword !== vi.settings.deleteConfirmKeyword
    ) {
      return NextResponse.json(
        { error: vi.settings.deleteKeywordMismatchError },
        { status: 400 }
      );
    }

    const userId = authProfile.user.id;

    // 1. Xóa toàn bộ file của người dùng trong Storage bucket 'source-files'
    const { data: userSets } = await supabase
      .from("question_sets")
      .select("id")
      .eq("owner_id", userId);

    const setIds = (userSets ?? []).map((s) => s.id);
    if (setIds.length > 0) {
      const { data: sourceFiles } = await supabase
        .from("source_files")
        .select("storage_path")
        .in("set_id", setIds);

      const storagePaths = (sourceFiles ?? [])
        .map((f) => f.storage_path)
        .filter((p) => p && !p.startsWith("local://"));

      if (storagePaths.length > 0) {
        await supabase.storage.from("source-files").remove(storagePaths);
      }
    }

    // 2. Xóa tài khoản auth.users (cascade toàn bộ dữ liệu DB)
    const { data: delRaw, error: delErr } = await supabase.rpc(
      "delete_my_account"
    );

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    const delPayload = delRaw as { error: string | null } | null;
    if (delPayload?.error) {
      return NextResponse.json({ error: delPayload.error }, { status: 500 });
    }

    await supabase.auth.signOut();

    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : vi.review.editor.errorStatus,
      },
      { status: 500 }
    );
  }
}

