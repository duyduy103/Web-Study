# Định Hướng Thiết Kế MemoQuiz: Khoa Học Trí Nhớ & Bản Sắc Trải Nghiệm

MemoQuiz phục vụ cả giáo viên (tốc độ, chính xác) và học sinh mọi lứa tuổi (tập trung, động lực ghi nhớ).

## 1. Hai Hướng Thiết Kế

### Hướng A: "Mindful Paper" (Giấy Mực Tĩnh Thức - Editorial Warmth)
- **Cảm giác**: Điềm tĩnh, hàn lâm, như trang sổ tay cao cấp; giảm căng thẳng thị giác khi ngồi lâu.
- **Bảng màu**: Nền kem ấm (#FBFBF9), chữ than (#1F2937), điểm nhấn Deep Sage (#166534) & Amber (#D97706).
- **Font & Bo góc**: Be Vietnam Pro; bo góc nhỏ gọn (8-12px), viền phẳng mỏng 1px, đổ bóng tối giản.
- **Hoạt ảnh**: Êm dịu, trượt mờ tuyến tính (fade & slide 200ms), không đàn hồi, không rung động.
- **Phù hợp**: Rất tốt cho người trưởng thành và giáo viên; nhưng hơi tĩnh, ít tạo hứng thú cho học sinh nhỏ.

### Hướng B: "Curious Spark" (Tia Sáng Trí Tuệ - Tactile & Dual-Space) [ĐỀ XUẤT]
- **Cảm giác**: Thân thiện, sinh động, giàu tính xúc giác (tactile); kích hoạt dopamine lành mạnh qua Active Recall.
- **Bảng màu (Hệ 2 không gian qua CSS Variables)**:
  - *Không gian làm việc (Teacher Workspace)*: Nền Slate sáng (#F8FAFC), chữ Slate đậm (#0F172A), điểm nhấn Teal (#0F766E).
  - *Không gian học (Student Space)*: Nền Mint ấm (#F0FDFA), thẻ trắng nổi bật, điểm nhấn Teal/Emerald (#0D9488), Coral (#F43F5E - Quên), Amber (#F59E0B - Khó), Sky (#0284C7 - Tốt), Green (#10B981 - Dễ).
- **Font & Bo góc**: Be Vietnam Pro; số đếm lớn, bo góc mềm mại (14-20px), hiệu ứng phím xúc giác êm tay.
- **Hoạt ảnh**: Spring nhẹ 200-350ms (chỉ transform + opacity); lật thẻ 3D 180°, nhịp tim streak, tiến độ chảy mượt; tự động tắt khi bật `prefers-reduced-motion`.
- **Vì sao chọn**: Tách bạch tâm lý giữa "soạn/duyệt bài" và "học tập". Học sinh có phản xạ hào hứng khi ôn thẻ mỗi ngày; giáo viên có không gian thanh thoát làm việc năng suất.

## 2. Hệ Thống Hai Không Gian (Dual Spaces)
- `data-space="workspace"`: Giao diện sáng sủa, thanh mảnh, dày đặc thông tin, tập trung hiệu suất duyệt và in đề.
- `data-space="study"`: Giao diện thẻ bài xúc giác, phím bấm lớn ≥48px, nhịp độ học tập nhịp nhàng.

## 3. Bản Mẫu Thử Nghiệm Giai Đoạn 1 (Hướng B)
1. **Đăng nhập (`/login`)**: Khung thẻ ấm áp, nút bấm xúc giác 3D phẳng, phản hồi rõ nét.
2. **Dashboard học sinh (`/dashboard`)**: Không gian học thân thiện, banner "Hôm nay cần ôn", thẻ streak phát sáng nhẹ.
3. **Thẻ ôn Gấp sách (`/study/[code]`)**: Lật thẻ 3D mượt mà, 4 nút FSRS màu xúc giác sống động, thanh tiến độ phiên.

