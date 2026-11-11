# Quy tắc dự án MemoQuiz (dành cho Antigravity agent)

Đọc `PRD.md` ở thư mục gốc trước khi làm bất kỳ việc gì. PRD là nguồn sự thật duy nhất về chức năng. Nếu yêu cầu của tôi mâu thuẫn với PRD, hãy hỏi lại thay vì tự quyết.

## 1. Bối cảnh sản phẩm

- Web app tạo đề kiểm tra và ôn tập theo khoa học trí nhớ, cho giáo viên và học sinh (kể cả trẻ tiểu học).
- Giá trị cốt lõi: giáo viên **không phải gõ tay đáp án**, chỉ duyệt kết quả tách tự động.
- Mọi chế độ học (quiz, flashcard, game, ôn ngắt quãng) dùng chung **một ngân hàng câu hỏi**.

## 2. Công nghệ (chỉ dùng danh sách này)

| Việc | Dùng |
|---|---|
| Framework | Next.js (App Router) + TypeScript (strict) |
| Giao diện | Tailwind CSS + shadcn/ui |
| Backend/DB/Auth/Storage | Supabase (Postgres + RLS) |
| AI | Gemini API qua SDK chính thức, chỉ gọi từ server |
| Kiểm tra dữ liệu | Zod |
| Đọc file | `mammoth` (docx), `xlsx` (SheetJS), PDF đưa thẳng cho Gemini |
| Lịch ôn | `ts-fsrs` |
| Mind map | `markmap` |
| Xuất đề | `docx` |
| Hiệu ứng | `framer-motion` |
| Test | Vitest (logic), Playwright (luồng chính, thêm khi cần) |

**Không thêm thư viện ngoài danh sách khi chưa hỏi tôi.** Nếu thấy cần, nêu lý do và lựa chọn thay thế rồi chờ tôi đồng ý.

## 3. Cấu trúc thư mục

```
/app                  # route (App Router), chỉ chứa trang và layout mỏng
/components
  /ui                 # shadcn/ui
  /features           # component theo tính năng (import, review, quiz, study, games)
/lib
  /ai                 # gọi Gemini, prompt, schema Zod cho đầu ra AI
  /parsing            # tách câu hỏi: regex, đọc docx/xlsx/pdf, ghép bảng đáp án
  /srs                # bọc ts-fsrs
  /export             # xuất docx/pdf, trộn mã đề
  /supabase           # client server/browser, kiểu dữ liệu
/supabase/migrations  # mọi thay đổi DB nằm ở đây
/tests
/docs                 # PRD.md, ghi chú kiến trúc
/samples              # file mẫu thật để test nhập liệu
```

- Logic nghiệp vụ nằm trong `/lib`, **không viết trong component hay route**.
- Một tệp một trách nhiệm. Tệp quá 300 dòng thì tách.

## 4. Quy ước mã

- TypeScript strict, **cấm `any`**; dùng `unknown` rồi thu hẹp bằng Zod.
- Tên biến, hàm, tệp bằng tiếng Anh. **Toàn bộ chữ hiển thị cho người dùng bằng tiếng Việt**, gom chuỗi vào một nơi (`/lib/i18n/vi.ts`) thay vì rải khắp component.
- Component hàm + hook; ưu tiên Server Component, chỉ dùng `"use client"` khi cần tương tác.
- Dữ liệu từ ngoài (form, file, phản hồi AI, tham số URL) **luôn qua Zod** trước khi dùng.
- Không để lỗi nuốt im lặng. Lỗi hiển thị cho người dùng phải bằng tiếng Việt, dễ hiểu, không lộ chi tiết kỹ thuật.
- Không viết comment giải thích điều hiển nhiên; chỉ comment "vì sao" cho đoạn khó.
- Dùng đường dẫn tuyệt đối `@/` thay cho `../../`.

## 5. Quy tắc cho phần AI (quan trọng)

1. **Chỉ gọi AI từ server** (route handler/server action). Không bao giờ để API key hoặc lời gọi AI ở trình duyệt.
2. Khóa và bí mật nằm trong biến môi trường; không commit `.env*`. Cập nhật `.env.example` khi thêm biến mới.
3. Đầu ra AI luôn là **JSON theo schema**, kiểm tra bằng Zod; hỏng thì thử lại tối đa 2 lần rồi báo lỗi thân thiện.
4. Prompt đặt trong `/lib/ai/prompts`, mỗi prompt một tệp, có chú thích đầu vào/đầu ra.
5. **Tiết kiệm chi phí:**
   - Thử tách bằng quy tắc (`/lib/parsing`) trước, chỉ gọi AI khi độ tin cậy thấp.
   - Gọi theo lô 20-30 câu, không gọi từng câu.
   - Cache theo mã băm SHA-256 của nội dung file; trùng thì dùng lại.
   - Ghi mỗi lần gọi vào `ai_usage` và kiểm tra hạn mức ngày trước khi gọi.
   - Dùng model rẻ cho tách câu; model mạnh chỉ cho sinh câu hỏi.
6. Câu hỏi AI sinh từ tài liệu **phải có `source_ref`**; không có thì loại.
7. Mọi nội dung AI tạo vào trạng thái `draft`, chỉ thành `approved` sau khi giáo viên duyệt.

## 6. Quy tắc cơ sở dữ liệu và bảo mật

- Mọi thay đổi schema qua file migration trong `/supabase/migrations`, không sửa tay trên dashboard.
- **Bật RLS cho mọi bảng chứa dữ liệu người dùng**, viết policy cùng lúc với bảng. Không bao giờ để bảng không có RLS.
- Không dùng `service_role` key ở phía client. Chỉ dùng ở server khi thực sự cần, và nói rõ lý do.
- Kiểm tra quyền ở server cho mọi thao tác ghi, không chỉ dựa vào giao diện.
- Giới hạn upload: tối đa 20MB, chỉ `.docx .pdf .xlsx .csv .txt`; kiểm tra loại file ở server.
- Với tài khoản học sinh nhỏ: thu thập tối thiểu dữ liệu cá nhân.

## 7. Quy tắc giao diện và trải nghiệm

- **Mobile-first**, dùng tốt từ 360px; nút bấm tối thiểu 44px.
- Giao diện giáo viên: gọn, ít bước, nhiều giá trị mặc định thông minh, có trạng thái đang tải và trạng thái trống rõ ràng.
- Giao diện cho bé (GĐ4): chữ lớn, tương phản cao, ít chữ, có hình và âm thanh (có nút tắt), không quảng cáo.
- Luôn xử lý 3 trạng thái: đang tải, lỗi, rỗng.
- Hỗ trợ bàn phím và nhãn ARIA; không chỉ dùng màu để truyền đạt thông tin.
- Hỗ trợ đầy đủ Unicode tiếng Việt có dấu (kể cả khi xuất Word/PDF).

## 8. Quy tắc phương pháp học (không được làm sai)

- Chế độ học mặc định là **hỏi trước, đáp án sau** (Active Recall). Không hiển thị đáp án trước khi người học trả lời hoặc bấm "Hiện đáp án".
- Lịch ôn dùng **FSRS qua `ts-fsrs`**, không tự viết thuật toán khác. Bốn mức tự chấm: Quên / Khó / Tốt / Dễ.
- Mỗi lần ôn (kể cả khi chơi game) phải **ghi `review_logs` và cập nhật `card_states`**.
- Chỉ câu hỏi `approved` mới hiện ra cho học sinh.

## 9. Cách làm việc với tôi

1. **Làm từng lát nhỏ.** Mỗi yêu cầu một tính năng, chạy được rồi mới sang cái tiếp. Không tự ý làm thêm tính năng ngoài yêu cầu hoặc ngoài giai đoạn hiện tại trong PRD.
2. **Việc lớn (nhiều tệp, đổi schema):** lập kế hoạch ngắn trước, chờ tôi đồng ý rồi mới viết mã.
3. **Việc nhỏ (sửa lỗi, chỉnh giao diện):** làm thẳng, không cần kế hoạch dài.
4. Trước khi báo "xong", tự chạy lint, kiểm tra kiểu (`tsc --noEmit`) và test liên quan; nếu lỗi thì sửa.
5. Khi báo kết quả: nêu ngắn gọn **đã làm gì, tệp nào đổi, cách tôi tự kiểm tra**. Không viết dài dòng.
6. Nếu thiếu thông tin hoặc có nhiều cách hiểu, **hỏi tôi một câu rõ ràng** thay vì đoán.
7. Không xóa hoặc ghi đè tệp quan trọng, không chạy lệnh phá hủy (`rm -rf`, reset DB, force push) khi chưa hỏi.
8. Gợi ý tôi commit git sau mỗi bước chạy được, với thông điệp commit ngắn gọn bằng tiếng Anh.
9. Khi sửa lỗi: tìm nguyên nhân gốc, không vá tạm bằng cách tắt kiểm tra kiểu, bỏ test hay bỏ RLS.
10. Giữ giải pháp đơn giản nhất đáp ứng được PRD. Không tối ưu sớm, không dựng kiến trúc phức tạp cho nhu cầu chưa có.

## 10. Kiểm thử phần nhập liệu

- Phần tách câu hỏi dễ lỗi nhất. Mọi thay đổi trong `/lib/parsing` phải chạy lại test trên các file ở `/samples`.
- Khi tôi gặp file bị tách sai, thêm file đó vào `/samples` kèm test hồi quy rồi mới sửa.
- Mục tiêu: file chuẩn ≥ 95% đúng không cần AI; file lộn xộn ≥ 85% đúng, phần còn lại được đánh cờ độ tin cậy thấp.

## 11. Giai đoạn hiện tại

**Đang làm: Giai đoạn 1 (Cốt lõi)**: đăng nhập, nạp file, tách câu hỏi-đáp án, màn hình duyệt, làm quiz, xuất đề trộn mã.

Chưa làm: game, lớp học, Mind Map, Feynman, Mnemonic, Loci. Đừng dựng sẵn chúng, trừ khi tôi yêu cầu rõ ràng.
