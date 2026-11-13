import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MyFeedbackClient } from "@/components/features/feedback/my-feedback-client";

export const metadata = {
  title: "Góp ý của tôi — MemoQuiz",
};

export default async function MyFeedbackPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: feedbackList } = await supabase
    .from("feedback")
    .select(
      "id, type, content, status, priority, public_response, public_response_at, user_read_at, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <MyFeedbackClient initialFeedback={feedbackList ?? []} />
      </div>
    </div>
  );
}
