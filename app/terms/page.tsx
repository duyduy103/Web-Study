import Link from "next/link";
import { vi } from "@/lib/i18n/vi";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <article className="mx-auto max-w-3xl space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
          {vi.legal.sampleDocumentBanner}
        </div>

        <h1 className="text-2xl font-bold text-slate-900">
          {vi.legal.termsTitle}
        </h1>

        <section className="space-y-3 text-sm leading-relaxed text-slate-700">
          <h2 className="text-base font-bold text-slate-900">
            1. Phạm vi dịch vụ & Vai trò tài khoản
          </h2>
          <p>
            MemoQuiz là nền tảng hỗ trợ tạo câu hỏi, ôn tập theo phương pháp
            khoa học (Active Recall, FSRS) và tổ chức kiểm tra. Người dùng có
            thể đăng ký với vai trò Học sinh / Tự học hoặc Giáo viên.
          </p>

          <h2 className="text-base font-bold text-slate-900">
            2. Điều kiện độ tuổi & Tài khoản học sinh
          </h2>
          <p>
            Người tạo tài khoản cần từ đủ 16 tuổi trở lên, hoặc đã có sự đồng ý
            của cha mẹ / người giám hộ hợp pháp. Trẻ em dưới 16 tuổi chưa có sự
            đồng ý có thể tham gia ôn tập hoặc làm bài qua mã lớp ẩn danh mà
            không cần đăng ký tài khoản.
          </p>

          <h2 className="text-base font-bold text-slate-900">
            3. Nội dung do người dùng tải lên
          </h2>
          <p>
            Người dùng chịu trách nhiệm về bản quyền và tính hợp pháp của tài
            liệu mình tải lên. Dữ liệu bộ câu hỏi và tài liệu gốc được lưu riêng
            tư theo từng tài khoản.
          </p>

          <h2 className="text-base font-bold text-slate-900">
            4. Giới hạn sử dụng hợp lý (Fair Use)
          </h2>
          <p>
            Để đảm bảo hệ thống vận hành ổn định, MemoQuiz áp dụng hạn mức gọi
            AI theo ngày, giới hạn số lượng bộ câu hỏi và dung lượng lưu trữ
            trên mỗi tài khoản.
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

