# PRD: Ôn Tập Thông Minh (tên tạm: **MemoQuiz**)

> Phiên bản 0.1 · Ngôn ngữ giao diện: Tiếng Việt · Nền tảng: Web (responsive, ưu tiên mobile)

---

## 1. Tổng quan

### 1.1 Vấn đề
- Giáo viên mất hàng giờ gõ tay câu hỏi và đáp án từ đề cương có sẵn (100 câu = rất lâu).
- Học sinh ôn bằng cách đọc lại sách, là cách kém hiệu quả nhất theo khoa học trí nhớ.
- Trẻ nhỏ khó duy trì động lực ôn tập.

### 1.2 Giải pháp
Một web app cho phép giáo viên **nạp đề cương/tài liệu có sẵn → hệ thống tự tạo bộ câu hỏi kèm đáp án → giáo viên chỉ duyệt, không gõ**. Học sinh ôn tập bằng các phương pháp đã được chứng minh (Active Recall, Spaced Repetition, Feynman, Mind Map, Mnemonic, Pomodoro) và học qua game vui cho các bé.

### 1.3 Tuyên bố giá trị
- Giáo viên: "Từ file đề cương đến bộ đề hoàn chỉnh trong vài phút."
- Học sinh: "Học ít thời gian hơn, nhớ lâu hơn, và vui hơn."

---

## 2. Người dùng

| Persona | Mô tả | Nhu cầu chính |
|---|---|---|
| **Giáo viên** (chính) | Dạy tiểu học đến THPT, có đề cương Word/PDF/Excel. Không rành công nghệ | Tạo đề nhanh, không nhập tay đáp án, xuất đề in, giao bài |
| **Học sinh lớn** (THCS, THPT) | Ôn thi, tự học | Ôn hiệu quả, biết hôm nay cần ôn gì, thấy tiến bộ |
| **Học sinh nhỏ** (tiểu học) | 6-11 tuổi | Học qua game, giao diện to rõ, có thưởng |
| **Phụ huynh** (phụ) | Theo dõi con | Xem tiến độ (giai đoạn sau) |

Giáo viên cũng có thể tự dùng như học sinh (tự ôn thi, sinh viên). Người dùng tự học không cần lớp.

---

## 3. Mục tiêu và phi mục tiêu

### Mục tiêu
1. Giáo viên tạo bộ 100 câu từ file có sẵn mà **không phải gõ đáp án**, thời gian duyệt dưới 10 phút.
2. Mọi chế độ học đều dựa trên một **ngân hàng câu hỏi duy nhất** (tạo một lần, dùng cho đề thi, flashcard, game, ôn tập ngắt quãng).
3. Phương pháp học là trung tâm sản phẩm, không phải tính năng phụ.
4. Chi phí AI trên mỗi người dùng ở mức thấp nhất có thể.

### Phi mục tiêu (chưa làm ở bản đầu)
- Không làm app native iOS/Android (dùng web responsive/PWA).
- Không làm thi giám sát (proctoring), chống gian lận nâng cao.
- Không làm thanh toán, gói trả phí.
- Không làm Phương pháp Loci (để giai đoạn sau).
- Không làm đa người chơi thời gian thực.

---

## 4. Nguyên tắc sản phẩm

1. **Giáo viên chỉ duyệt, không gõ.** Mọi thiết kế ưu tiên giảm thao tác nhập tay.
2. **Hỏi trước, đáp án sau.** Mặc định luôn bắt người học nhớ lại trước khi xem đáp án.
3. **Một ngân hàng câu hỏi, nhiều cách học.**
4. **AI đề xuất, con người quyết định.** Không câu hỏi do AI tạo nào được dùng chính thức khi chưa qua duyệt.
5. **Không bịa.** Câu hỏi sinh từ tài liệu phải kèm trích dẫn nguồn (trang/đoạn).
6. **Đơn giản cho người không rành công nghệ**: ít bước, chữ rõ, có file mẫu.

---

## 5. Phạm vi theo giai đoạn

| Giai đoạn | Nội dung | Kết quả |
|---|---|---|
| **GĐ1: Cốt lõi** | Đăng nhập, nạp file, tách câu hỏi-đáp án, màn hình duyệt, làm quiz, xuất đề trộn mã | Giáo viên tạo và dùng được đề |
| **GĐ2: Phương pháp học** | Active Recall, FSRS + "Hôm nay cần ôn", Pomodoro, thống kê câu hay sai | Học sinh ôn đúng khoa học |
| **GĐ3: AI mở rộng** | Sinh câu từ tài liệu, Mind Map, Feynman, Mnemonic | Thêm nguồn tạo đề và công cụ học |
| **GĐ4: Trẻ em** | Game, thưởng, streak, thú cưng, lớp học, giao bài | Phủ nhóm học sinh nhỏ |
| **Sau này** | Phương pháp Loci, phụ huynh, PWA offline | Mở rộng |

---

## 6. Chức năng chi tiết

### F1. Nạp nội dung và tạo câu hỏi (GĐ1, quan trọng nhất)

#### 6.1.1 Các đường vào

| ID | Giáo viên có | Định dạng | Cách xử lý |
|---|---|---|---|
| F1.1 | Đề cương kèm đáp án trong cùng file | .docx, .pdf, .xlsx, dán văn bản | Tách cặp câu hỏi - đáp án bằng quy tắc (regex); nếu thất bại hoặc độ tin cậy thấp thì dùng AI |
| F1.2 | Đề + bảng đáp án cuối đề ("1-A 2-C 3-B") | .docx, .pdf, dán | Tách đề và bảng đáp án riêng, ghép theo số câu. Không cần AI |
| F1.3 | Chỉ có câu hỏi dạng Hỏi-Đáp ngắn | mọi định dạng | Giữ nguyên làm flashcard/tự luận ngắn; tùy chọn: AI sinh thêm **đáp án nhiễu** để thành trắc nghiệm, kèm giải thích |
| F1.4 | Chỉ có tài liệu/bài giảng (GĐ3) | .docx, .pdf, ảnh scan | AI sinh câu hỏi + đáp án + giải thích, kèm **trích dẫn trang/đoạn nguồn** |
| F1.5 | Bảng Excel/CSV theo cột | .xlsx, .csv | Cho giáo viên ánh xạ cột (Câu hỏi, Đáp án đúng, Đáp án sai 1...) rồi nhập |

Hỗ trợ **dán thẳng từ Word/Excel** vào ô văn bản. Có **tải file mẫu** (Excel, Word).

#### 6.1.2 Luồng tạo bộ câu hỏi

1. Giáo viên chọn "Tạo bộ câu hỏi mới" → đặt tên, môn, lớp.
2. Chọn cách nạp (kéo thả file / dán văn bản / tải mẫu).
3. Hệ thống phát hiện kiểu cấu trúc và hiển thị "Tôi tìm thấy 98 câu. Đúng không?" cùng bản xem trước vài câu đầu.
4. Hệ thống tách câu (quy tắc trước, AI sau), hiển thị tiến trình.
5. Chuyển sang **màn hình duyệt** (F2).
6. Giáo viên bấm "Lưu vào ngân hàng câu hỏi".

#### 6.1.3 Loại câu hỏi hỗ trợ

| Loại | Mã | GĐ |
|---|---|---|
| Trắc nghiệm 1 đáp án | `mcq` | 1 |
| Đúng/Sai | `true_false` | 1 |
| Điền khuyết (cloze) | `cloze` | 1 |
| Tự luận ngắn / Hỏi-Đáp (flashcard) | `short_answer` | 1 |
| Nối cặp | `matching` | 2 |
| Trắc nghiệm nhiều đáp án | `mcq_multi` | 2 |

#### 6.1.4 Quy tắc tối ưu chi phí AI
1. Thử tách bằng quy tắc trước; chỉ gọi AI khi độ tin cậy dưới ngưỡng.
2. Dùng model rẻ cho tách câu; model mạnh hơn chỉ cho sinh câu hỏi.
3. Gọi AI theo lô 20-30 câu.
4. Cache kết quả theo mã băm (SHA-256) nội dung file.
5. Giới hạn số lần gọi AI mỗi tài khoản mỗi ngày.

#### 6.1.5 Tiêu chí chấp nhận
- File có 100 câu định dạng chuẩn → tách đúng ≥ 95% mà không cần AI.
- File lộn xộn → AI tách đúng ≥ 85%, phần còn lại được cờ đỏ để giáo viên xem.
- Upload lại cùng file không phát sinh thêm chi phí AI.
- Giáo viên không phải gõ lại đáp án của bất kỳ câu nào đã tách đúng.

---

### F2. Màn hình duyệt nhanh (GĐ1)

**Mục tiêu:** duyệt 100 câu dưới 10 phút.

- Bảng/danh sách câu hỏi, mỗi câu hiển thị: nội dung, đáp án, loại, **độ tin cậy** (xanh / vàng / đỏ).
- Bộ lọc: "Chỉ xem câu cần kiểm tra" (vàng + đỏ).
- Nút **"Duyệt tất cả câu xanh"**.
- Sửa trực tiếp ngay tại dòng (inline), có Ctrl+Enter để lưu và chuyển câu kế.
- Trên mobile: vuốt phải = giữ, vuốt trái = loại.
- Sửa hàng loạt: đổi loại câu, gán chủ đề/độ khó cho nhiều câu.
- Hiển thị đoạn nguồn gốc (nếu có) bên cạnh để đối chiếu.
- Hoàn tác (undo) mọi thao tác.
- Trạng thái câu: `nháp` → `đã duyệt` → `lưu trữ`. Chỉ câu `đã duyệt` mới xuất hiện cho học sinh.

---

### F3. Tạo đề kiểm tra và xuất đề (GĐ1)

- Chọn câu từ ngân hàng theo chủ đề/độ khó/ngẫu nhiên, đặt số câu, điểm mỗi câu.
- **Trộn thứ tự câu và đáp án** để tạo nhiều mã đề (ví dụ 4 mã: 101, 102, 103, 104).
- Xuất **Word (.docx)** và **PDF** để in: đề, phiếu đáp án, đáp án theo từng mã đề.
- Làm bài online: giao link, học sinh làm, chấm tự động (trắc nghiệm, đúng/sai, điền khuyết). Tự luận ngắn được AI hỗ trợ chấm theo đáp án mẫu, giáo viên có thể sửa điểm.
- Hiển thị kết quả: điểm, câu sai, thống kê theo câu (câu nào nhiều bạn sai nhất).

---

### F4. Ôn tập chủ động - Active Recall (GĐ2)

- Chế độ **"Gấp sách"**: chỉ hiện câu hỏi; học sinh tự nghĩ/nhập câu trả lời, sau đó mới bấm "Hiện đáp án".
- Sau khi xem đáp án, học sinh tự chấm: **Quên / Khó / Tốt / Dễ** (4 nút, ánh xạ sang rating của FSRS).
- Với trắc nghiệm: có tùy chọn ẩn lựa chọn, bắt gõ/nhớ câu trả lời trước.
- Đây là chế độ **mặc định** khi vào học, thay vì xem lại nội dung.

### F5. Lặp lại ngắt quãng - Spaced Repetition (GĐ2)

- Dùng thuật toán **FSRS** (thư viện `ts-fsrs`).
- Mỗi cặp (học sinh, câu hỏi) có trạng thái thẻ riêng: độ ổn định, độ khó, ngày ôn kế tiếp, số lần quên.
- Trang **"Hôm nay cần ôn"**: danh sách và số lượng thẻ đến hạn; giới hạn thẻ mới/ngày (mặc định 20, chỉnh được).
- Ngày ôn kế tiếp hiển thị rõ ("Gặp lại sau 3 ngày").
- Lịch sử mỗi lần ôn được lưu (để tính thống kê và tối ưu tham số sau này).
- Thông báo nhắc ôn (email hoặc web push, giai đoạn sau).

### F6. Pomodoro và nghỉ ngơi (GĐ2)

- Đồng hồ 25 phút học / 5 phút nghỉ; sau 4 vòng nghỉ dài 15 phút. Tùy chỉnh thời lượng.
- Nhắc nghỉ bằng âm thanh nhẹ, màn hình nghỉ có gợi ý (uống nước, vươn vai).
- Nhắc **ngủ đủ giấc** (ví dụ gợi ý dừng ôn sau giờ cài đặt; kiến thức mới ôn tối trước khi ngủ sẽ được củng cố).
- Với bé: thời lượng ngắn hơn mặc định (10/3).

### F7. Thống kê học tập (GĐ2)

- Biểu đồ: số thẻ đã ôn mỗi ngày, tỉ lệ nhớ, streak.
- Danh sách **câu hay sai** (leech), gợi ý ôn riêng hoặc tạo mẹo nhớ.
- Giáo viên: thống kê theo lớp, theo câu, theo học sinh.

### F8. Sơ đồ tư duy - Mind Map (GĐ3)

- AI trích cấu trúc tài liệu/bộ câu hỏi thành cây JSON (chủ đề → nhánh → ý).
- Hiển thị bằng `markmap`; thu/mở nhánh, tải ảnh.
- Click vào nhánh → xem/ôn các câu hỏi liên quan.
- Giáo viên có thể sửa cây trước khi chia sẻ.

### F9. Kỹ thuật Feynman (GĐ3)

- Học sinh chọn một khái niệm, **gõ hoặc nói** giải thích bằng lời đơn giản.
- AI đối chiếu với tài liệu nguồn, chỉ ra: ý đúng, ý thiếu, ý sai, và đặt 1-2 câu hỏi gợi mở.
- Không đưa ngay đáp án hoàn chỉnh; khuyến khích học sinh sửa lại lời giải thích.

### F10. Mẹo nhớ - Mnemonic (GĐ3)

- Nút "Tạo mẹo nhớ" trên câu/khái niệm (đặc biệt câu hay sai).
- AI sinh: vần/thơ ngắn, từ viết tắt, hình ảnh liên tưởng hài hước, phù hợp độ tuổi.
- Học sinh có thể lưu mẹo mình thích hoặc tự viết mẹo riêng gắn vào thẻ.

### F11. Game cho bé (GĐ4)

Làm bằng React thuần, lấy dữ liệu từ ngân hàng câu hỏi (giáo viên không làm thêm gì).

| Game | Mô tả |
|---|---|
| Lật thẻ ghép cặp | Ghép câu hỏi với đáp án |
| Kéo thả nối từ | Nối khái niệm - định nghĩa |
| Đua tốc độ | Quiz có đồng hồ, "đua" với nhân vật |
| Điền chữ còn thiếu | Xếp/chọn chữ cái để hoàn thành từ |

**Hệ thống thưởng:** sao, streak ngày học, huy hiệu, **thú cưng** lớn dần khi ôn đều. Âm thanh vui, hiệu ứng nhẹ; có nút tắt âm thanh.

**Quy tắc quan trọng:** kết quả game vẫn **cập nhật lịch FSRS**, để chơi game cũng là ôn tập ngắt quãng thật sự.

### F12. Lớp học và giao bài (GĐ4)

- Giáo viên tạo lớp, mã tham gia (học sinh vào bằng mã/QR, không cần email với bé nhỏ).
- Giao bộ câu hỏi/đề cho lớp, đặt hạn nộp.
- Tài khoản bé do giáo viên/phụ huynh tạo; không thu thập thông tin cá nhân không cần thiết.

---

## 7. Luồng màn hình chính

**Giáo viên:**
`Đăng nhập → Trang chủ (bộ câu hỏi của tôi) → Tạo bộ mới → Nạp file → Tách câu (tiến trình) → Duyệt nhanh → Lưu → Ngân hàng câu hỏi → Tạo đề → Xuất Word/PDF hoặc Giao lớp → Xem kết quả`

**Học sinh:**
`Đăng nhập/nhập mã lớp → Trang chủ ("Hôm nay cần ôn: 15 thẻ") → Bắt đầu ôn (Gấp sách) → Tự chấm → Tổng kết phiên (sao, streak) → Chọn thêm: Quiz / Game / Mind Map / Feynman`

**Danh sách màn hình:**
1. Đăng nhập/đăng ký
2. Trang chủ giáo viên
3. Nạp file (kéo thả, dán, mẫu)
4. Tiến trình tách câu
5. Duyệt nhanh
6. Ngân hàng câu hỏi (lọc, tìm kiếm, chủ đề)
7. Tạo đề & xuất đề
8. Trang chủ học sinh ("Hôm nay cần ôn")
9. Phiên ôn tập (Gấp sách)
10. Làm bài kiểm tra
11. Kết quả & thống kê
12. Pomodoro (gắn vào phiên ôn)
13. Mind Map, Feynman, Mnemonic (GĐ3)
14. Game & phần thưởng (GĐ4)
15. Lớp học (GĐ4)

---

## 8. Mô hình dữ liệu (mức khái niệm)

```
profiles        (id, role[teacher|student], display_name, created_at)
question_sets   (id, owner_id, title, subject, grade, source_file_hash, created_at)
source_files    (id, set_id, storage_path, file_hash, mime_type, page_count)
questions       (id, set_id, type, stem, explanation, source_ref, topic, difficulty,
                 confidence, status[draft|approved|archived], created_at)
choices         (id, question_id, text, is_correct, position)        -- cho mcq, true_false
answers         (id, question_id, answer_text, accepted_variants[])  -- cho short_answer, cloze
exams           (id, owner_id, title, duration_min, shuffle_questions, shuffle_choices)
exam_versions   (id, exam_id, code, question_order[], choice_orders{})
exam_questions  (exam_id, question_id, points, position)
attempts        (id, exam_id/set_id, student_id, started_at, submitted_at, score)
attempt_answers (id, attempt_id, question_id, response, is_correct, ai_feedback)
card_states     (student_id, question_id, due, stability, difficulty, reps, lapses,
                 state, last_review)                                  -- FSRS
review_logs     (id, student_id, question_id, rating, reviewed_at, state_before, elapsed_days)
mnemonics       (id, question_id, author_id, content, is_ai)
mindmaps        (id, set_id, tree_json)
classes         (id, teacher_id, name, join_code)
class_members   (class_id, student_id)
assignments     (id, class_id, exam_id/set_id, due_at)
rewards         (student_id, stars, streak_days, last_study_date, pet_level, badges[])
ai_usage        (id, user_id, date, calls, tokens)                    -- giới hạn chi phí
```

Mọi bảng dữ liệu người dùng bật **Row Level Security**: người dùng chỉ đọc/ghi dữ liệu của mình hoặc lớp mình thuộc về.

---

## 9. Đặc tả AI

### 9.1 Nhiệm vụ AI
| Nhiệm vụ | Đầu vào | Đầu ra (JSON theo schema) |
|---|---|---|
| Tách cặp hỏi-đáp từ văn bản lộn xộn | Văn bản/PDF/ảnh | Mảng `{stem, answer, type, confidence, source_ref}` |
| Sinh đáp án nhiễu + giải thích | Câu hỏi + đáp án đúng | `{distractors[3], explanation}` |
| Sinh câu hỏi từ tài liệu | Đoạn tài liệu | Mảng câu hỏi + `source_ref` (trang, đoạn trích) |
| Chấm tự luận ngắn | Đáp án mẫu + câu trả lời học sinh | `{score, feedback}` |
| Mind Map | Tài liệu/bộ câu hỏi | Cây JSON |
| Feynman | Khái niệm + lời giải thích của học sinh | `{correct[], missing[], wrong[], follow_up_questions[]}` |
| Mnemonic | Câu/khái niệm + độ tuổi | Mảng mẹo nhớ |

### 9.2 Quy tắc bắt buộc
1. Đầu ra luôn là **JSON theo schema** (structured output), kiểm tra bằng Zod trước khi lưu.
2. Sinh từ tài liệu: mỗi câu **phải có `source_ref`**; câu không trích dẫn được thì loại.
3. Không để AI quyết định thay giáo viên: mọi câu do AI tạo vào trạng thái `draft`.
4. Gọi AI chỉ từ **server** (API route), không bao giờ từ trình duyệt; API key nằm trong biến môi trường.
5. Có timeout, thử lại tối đa 2 lần, và thông báo lỗi dễ hiểu bằng tiếng Việt.
6. Nội dung cho trẻ em phải phù hợp lứa tuổi.

---

## 10. Yêu cầu phi chức năng

| Hạng mục | Yêu cầu |
|---|---|
| **Hiệu năng** | Trang tải dưới 3 giây trên 4G; tách 100 câu bằng quy tắc dưới 5 giây; có tiến trình khi dùng AI |
| **Responsive** | Dùng tốt trên điện thoại 360px trở lên; nút bấm ≥ 44px |
| **Trẻ em** | Chữ lớn, tương phản cao, ít chữ, có âm thanh/hình; không quảng cáo; không hiển thị liên kết ra ngoài |
| **Bảo mật** | RLS trên mọi bảng; kiểm tra quyền ở server; giới hạn kích thước/loại file upload (≤ 20MB); không lưu API key phía client |
| **Quyền riêng tư** | Tối thiểu hóa dữ liệu cá nhân của học sinh nhỏ; xóa dữ liệu theo yêu cầu; tuân thủ quy định bảo vệ dữ liệu cá nhân của Việt Nam |
| **Truy cập** | Điều hướng bằng bàn phím, nhãn ARIA, không dựa riêng vào màu sắc |
| **Chi phí** | Theo dõi `ai_usage`; giới hạn mặc định số lần sinh/ngày/tài khoản |
| **Ngôn ngữ** | Toàn bộ giao diện và thông báo lỗi bằng tiếng Việt; hỗ trợ đầy đủ Unicode, dấu tiếng Việt, công thức toán cơ bản |
| **Dữ liệu** | Sao lưu tự động (theo nhà cung cấp); xuất bộ câu hỏi ra Excel |

---

## 11. Chỉ số thành công

**Giáo viên**
- Thời gian từ upload đến bộ câu hỏi đã duyệt: **< 10 phút / 100 câu**.
- Tỉ lệ câu "xanh" được giữ nguyên không sửa: **≥ 80%**.
- Tỉ lệ giáo viên tạo bộ thứ hai trong 7 ngày: **≥ 50%**.

**Học sinh**
- Số học sinh hoàn thành phiên ôn mỗi ngày.
- Streak trung bình.
- Tỉ lệ nhớ (retention) ở lần ôn thứ 3 trở đi.

**Kỹ thuật**
- Chi phí AI trung bình / bộ 100 câu.
- Tỉ lệ file tách thành công không cần AI.

---

## 12. Rủi ro và cách giảm

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| File đề cương lộn xộn, tách sai | Cao | Màn hình duyệt có cờ tin cậy; bộ file mẫu thật để test; cho ánh xạ thủ công |
| AI bịa đáp án | Cao | Bắt buộc `source_ref`; trạng thái nháp; giáo viên duyệt |
| PDF scan, chữ mờ | Trung bình | Dùng model đọc ảnh; cảnh báo khi chất lượng thấp |
| Chi phí AI tăng | Trung bình | Quy tắc trước, cache, theo lô, hạn mức |
| Dữ liệu trẻ em | Cao | Tối thiểu dữ liệu, tài khoản qua lớp, RLS, không quảng cáo |
| Phạm vi quá rộng | Cao | Làm theo giai đoạn; chỉ GĐ1 trước, dùng được rồi mới sang tiếp |
| Bản quyền tài liệu giáo viên nạp | Trung bình | Dữ liệu riêng tư theo mặc định; điều khoản sử dụng rõ ràng |

---

## 13. Câu hỏi mở (cần quyết định sớm)

1. Học sinh có bắt buộc tạo tài khoản không, hay vào bằng mã lớp/link ẩn danh?
tôi nghĩ sẽ có 2 option và nếu học sinh tạo tài khoản thì sẽ lưu được những lịch sử bài học và câu hỏi ôn tập ....
2. Giáo viên có chia sẻ công khai bộ câu hỏi cho giáo viên khác (thư viện chung) không?
hiện giờ chưa cần
3. Mô hình kinh doanh: miễn phí hoàn toàn, hay giới hạn lượt dùng AI để làm gói trả phí sau?
giới hạn lượt dùng AI để làm gói trả phí sau
4. Môn học ưu tiên đầu tiên (ảnh hưởng đến công thức toán, ký hiệu hóa học, tiếng Anh...)?
ko có môn ưu tiên 
5. Có cần hỗ trợ đọc to câu hỏi (text-to-speech) cho bé nhỏ ở GĐ4 không?
tôi nghĩ là không

---

## 14. Định nghĩa "Hoàn thành" cho GĐ1

- [ ] Đăng ký/đăng nhập giáo viên hoạt động.
- [ ] Nạp được .docx, .pdf, .xlsx và dán văn bản.
- [ ] Tách đúng ≥ 95% trên file mẫu chuẩn, ≥ 85% trên file lộn xộn.
- [ ] Màn hình duyệt: lọc theo độ tin cậy, sửa tại dòng, duyệt hàng loạt, undo.
- [ ] Làm quiz online với 4 loại câu (mcq, true_false, cloze, short_answer).
- [ ] Xuất đề Word/PDF với ≥ 4 mã đề trộn.
- [ ] Cache theo mã băm file hoạt động.
- [ ] RLS bật trên mọi bảng, đã kiểm thử.
- [ ] Chạy tốt trên điện thoại.
- [ ] Triển khai được lên Vercel + Supabase.
