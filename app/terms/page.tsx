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

          <h2 className="text-base font-bold text-slate-900">
            5. Gói dịch vụ trả phí (Premium) & Hạn mức theo gói
          </h2>
          <p>
            Tài khoản đăng ký hoặc được cấp gói Cao cấp (Premium) theo chu kỳ
            Tháng hoặc Năm được hưởng các hạn mức nâng cao đọc trực tiếp từ cấu
            hình hệ thống (lưu tối đa 100 bộ câu hỏi, 50 lượt AI mỗi ngày tính
            theo múi giờ Việt Nam, tệp tải lên tối đa 20 MB / 60 trang PDF, 500 MB
            lưu trữ và xuất tối đa 8 mã đề ra tệp Word .docx & PDF A4). Khi gói
            Premium hết hạn và tài khoản quay về gói Miễn phí, toàn bộ bộ câu hỏi
            và lịch sử học tập đã tạo vẫn được giữ nguyên an toàn; hệ thống chỉ
            tạm chặn tạo thêm bộ mới nếu tổng số bộ đang vượt giới hạn gói Miễn
            phí.
          </p>

          <h2 className="text-base font-bold text-slate-900">
            6. Thanh toán tự động qua VietQR (SePay) & Chính sách hoàn tiền (Bản thảo mẫu — Cần kế toán/luật sư rà soát)
          </h2>
          <p>
            MemoQuiz hỗ trợ thanh toán chuyển khoản ngân hàng qua mã VietQR và
            xác nhận tự động bằng cổng webhook SePay. Mỗi đơn hàng có một mã nội
            dung chuyển khoản duy nhất và có hiệu lực chờ thanh toán trong 48 giờ.
            Khi người dùng chuyển khoản đúng số tiền và nội dung, gói Premium
            được kích hoạt tự động trong vòng 1–2 phút (nếu tài khoản đang còn
            hạn Premium, số ngày mới sẽ được cộng nối tiếp vào ngày hết hạn hiện
            tại). Trường hợp chuyển sai số tiền hoặc ghi thiếu mã đơn, giao dịch
            được lưu vào danh sách đối soát để Quản trị viên hỗ trợ xử lý thủ
            công. Chính sách hoàn tiền mẫu: hỗ trợ hoàn tiền trong vòng 7 ngày
            đầu tiên nếu phát sinh lỗi kỹ thuật từ phía hệ thống hoặc chuyển
            khoản thừa/trùng đơn hàng (cần kế toán/đơn vị vận hành rà soát quy
            trình chứng từ hoàn tiền trước khi vận hành thương mại chính thức).
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

