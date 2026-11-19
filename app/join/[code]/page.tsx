import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { normalizeJoinCode } from "@/lib/classes/constants";
import {
  mapClassRpcError,
  type ClassJoinPreview,
} from "@/lib/classes/schemas";
import { vi } from "@/lib/i18n/vi";
import { JoinClassClient } from "@/components/features/classes/join-class-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${vi.classes.join.pageTitle} — ${vi.app.name}`,
};

async function getServerClientIp(): Promise<string> {
  try {
    const hdrs = await headers();
    const fwd = hdrs.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
    return hdrs.get("x-real-ip")?.trim() || "local";
  } catch {
    return "local";
  }
}

export default async function JoinClassByCodePage(props: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await props.params;
  const normalizedCode = normalizeJoinCode(decodeURIComponent(code));
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    clientIp,
  ] = await Promise.all([supabase.auth.getUser(), getServerClientIp()]);

  let initialPreview: ClassJoinPreview | null = null;
  let initialError: string | null = null;

  if (normalizedCode) {
    const { data, error } = await supabase.rpc("lookup_class_by_join_code", {
      p_join_code: normalizedCode,
      p_client_ip: clientIp,
    });

    if (error) {
      initialError = vi.classes.errors.systemError;
    } else {
      const payload = data as {
        error?: string | null;
        class?: ClassJoinPreview;
      } | null;
      if (!payload || payload.error || !payload.class) {
        initialError = mapClassRpcError(
          payload?.error ?? "INVALID_CODE"
        ).message;
      } else {
        initialPreview = payload.class;
      }
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-8 sm:px-6">
      <JoinClassClient
        initialCode={normalizedCode}
        initialPreview={initialPreview}
        initialError={initialError}
        isLoggedIn={Boolean(user)}
      />
    </main>
  );
}

