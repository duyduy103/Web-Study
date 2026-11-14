import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getUserEntitlements } from "@/lib/entitlements";
import { PricingClient } from "@/components/features/pricing/pricing-client";
import { vi } from "@/lib/i18n/vi";

export const metadata: Metadata = {
  title: `${vi.plans.pricingTitle} - MemoQuiz`,
  description: vi.plans.pricingSubtitle,
};

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let entitlements = null;
  if (user) {
    entitlements = await getUserEntitlements(supabase, user.id);
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8">
      <PricingClient
        currentEntitlements={entitlements}
        isLoggedIn={Boolean(user)}
      />
    </main>
  );
}

