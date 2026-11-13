import Link from "next/link";
import { vi } from "@/lib/i18n/vi";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <article className="mx-auto max-w-3xl space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
          {vi.legal.sampleDocumentBanner}
        </div>

        <h1 className="text-2xl font-bold text-slate-900">
          {vi.legal.privacyTitle}
        </h1>

        <section className="space-y-3 text-sm leading-relaxed text-slate-700">
          <h2 className="text-base font-bold text-slate-900">
            1. Dữ liệu chúng tôi thu thập
          </h2>
          <p>
            MemoQuiz chỉ thu thập thông tin tối thiểu: địa chỉ email đăng nhập,
            tên hiển thị, vai trò (Học sinh / Giáo viên), thời điểm xác nhận đồng
            ý điều khoản và dữ liệu học tập (bộ câu hỏi, tiến độ ôn tập FSRS,
            lịch sử làm bài) của chính bạn.
          </p>

          <h2 className="text-base font-bold text-slate-900">
            2. Cách bảo vệ dữ liệu & Quyền riêng tư
          </h2>
          <p>
            Toàn bộ dữ liệu được cách ly bằng Row Level Security (RLS) trên cơ
            sở dữ liệu: tài khoản khác không thể xem hoặc sửa bộ câu hỏi, file
            gốc hay tiến độ học của bạn. MemoQuiz không hiển thị quảng cáo và
            không bán dữ liệu người dùng.
          </p>

          <h2 className="text-base font-bold text-slate-900">
            3. Quyền chỉnh sửa & Xóa toàn bộ dữ liệu
          </h2>
          <p>
            Bạn có thể cập nhật tên hiển thị hoặc yêu cầu xóa vĩnh viễn tài khoản
            cùng toàn bộ bộ câu hỏi, file đã tải lên Storage và lịch sử học tập
            bất kỳ lúc nào trong trang Cài đặt tài khoản.
          </p>
        </section>

        <div className="pt-4">
          <Link
            href="/signup"
            className="inline-flex min-h-[44px] items-center rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700"
          >
            ← {vi.nav.signup}
          </Link>
        </div>
      </article>
    </main>
  );
}

