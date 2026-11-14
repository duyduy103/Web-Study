# Hướng dẫn Triển khai (Deployment) & Gắn Thanh toán Tự động SePay

Tài liệu này hướng dẫn cấu hình môi trường sản phẩm (Vercel + Supabase) và tích hợp cổng xác nhận giao dịch ngân hàng tự động **SePay (VietQR)** cho MemoQuiz.

---

## 1. Biến môi trường bắt buộc trên Vercel / Production

Cấu hình đầy đủ các biến môi trường sau trong phần **Project Settings > Environment Variables** trên Vercel (khớp với `.env.example`):

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# Gemini AI
GEMINI_API_KEY=<gemini-api-key>
GEMINI_MODEL=gemini-3.5-flash-lite

# URL công khai của ứng dụng
NEXT_PUBLIC_APP_URL=https://<ten-mien-cua-ban>.vercel.app

# Cấu hình thanh toán VietQR & SePay (Bước 13)
BANK_CODE=MBBank
BANK_NAME=Ngân hàng TMCP Quân đội (MB Bank)
BANK_ACCOUNT_NUMBER=0123456789
BANK_ACCOUNT_NAME=NGUYEN VAN A
SEPAY_WEBHOOK_API_KEY=<chuoi-bi-mat-ngau-nhien-32-ky-tu>
PAYMENT_CODE_PREFIX=MQ
```

> **Lưu ý quan trọng:** Giá gói (`39.000đ/tháng`, `299.000đ/năm`), chu kỳ và hạn mức **không** cấu hình qua biến môi trường mà được quản lý tập trung trong bảng `public.plans` trên cơ sở dữ liệu (có thể chỉnh trực tiếp tại `/admin/orders` > tab **Cấu hình giá & hạn mức gói**).

---

## 2. Gắn SePay (Tự động xác nhận chuyển khoản VietQR 24/7)

### Bước 2.1: Liên kết tài khoản ngân hàng trên SePay
1. Đăng nhập vào bảng điều khiển [my.sepay.vn](https://my.sepay.vn).
2. Vào mục **Ngân hàng** → **Thêm ngân hàng** và làm theo hướng dẫn để liên kết tài khoản nhận tiền (khớp với `BANK_CODE`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME` trong `.env`).

### Bước 2.2: Cấu hình Cấu trúc mã thanh toán (`PAYMENT_CODE_PREFIX`)
1. Trên SePay, vào mục **Công ty** → **Cấu hình chung** → phần **Cấu trúc mã thanh toán**.
2. Đặt **Tiền tố (Prefix)** khớp chính xác với biến `PAYMENT_CODE_PREFIX` trong `.env` (mặc định là `MQ`).
3. Đặt độ dài/cấu trúc hậu tố cho phép nhận diện chuỗi **8 ký tự chữ và số** (ví dụ: `MQK7M9P2X4`).
4. Lưu cấu hình để SePay tự bóc tách mã vào trường `code` của Webhook (ngoài ra, ứng dụng cũng có bộ tìm kiếm dự phòng bằng biểu thức chính quy trực tiếp trên trường `content`).

### Bước 2.3: Tạo Webhook gọi về ứng dụng
1. Trên SePay, vào mục **Tích hợp Webhooks** → **Thêm Webhook**.
2. Điền các thông số:
   - **Tên gợi nhớ:** `MemoQuiz Production`
   - **Sự kiện:** Chỉ khi có **tiền vào** (hoặc Tất cả — ứng dụng sẽ tự bỏ qua giao dịch `transferType != 'in'`).
   - **Gọi đến URL:**
     ```text
     https://<ten-mien-cua-ban>/api/payments/webhook/sepay
     ```
   - **Kiểu chứng thực (Authentication):** Chọn **API Key**.
   - **API Key:** Nhập đúng giá trị của biến `SEPAY_WEBHOOK_API_KEY` (SePay sẽ gửi header `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`).
   - **Kiểu dữ liệu (Content-Type):** `application/json`.
   - **Gọi lại khi thất bại:** Bật (Webhook của ứng dụng luôn trả HTTP `200 {"success": true}` khi đã ghi nhận sự kiện, kể cả giao dịch lệch tiền cần Admin duyệt tại `/admin/orders`, nên SePay sẽ không gọi lặp vô tận).

### Bước 2.4: Thử nghiệm giao dịch
- **Trên môi trường Local (`http://localhost:3000`):**
  Webhook thật từ máy chủ SePay **cần một URL công khai (như Vercel)** và không thể gọi trực tiếp vào `localhost`. Để kiểm thử toàn bộ luồng kích hoạt gói tại máy cá nhân:
  1. Tạo một đơn hàng mới tại `http://localhost:3000/dashboard/billing` và lấy mã thanh toán (ví dụ `MQK7M9P2X4`).
  2. Chạy lệnh giả lập trong terminal:
     ```bash
     npm run payments:simulate -- MQK7M9P2X4 39000
     ```
  3. Trang thanh toán sẽ tự chuyển sang **"Thanh toán thành công!"** trong vài giây và tạo thông báo trong ứng dụng.
- **Trên môi trường Production (Vercel):**
  1. Có thể dùng công cụ **Giả lập giao dịch** ngay trong SePay Dashboard để bắn thử một bản tin về `https://<domain>/api/payments/webhook/sepay`.
  2. Kiểm tra kết quả trong trang Quản trị `/admin/orders` (tab **Danh sách đơn hàng** và **Giao dịch cần xem**).

