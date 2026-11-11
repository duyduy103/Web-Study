export const vi = {
  app: {
    name: "MemoQuiz",
    roleBadge: "Giáo viên",
    tagline: "Từ file đề cương đến bộ đề hoàn chỉnh trong vài phút",
    description:
      "Hệ thống tạo đề kiểm tra và ôn tập thông minh dành cho giáo viên và học sinh Việt Nam.",
  },
  nav: {
    dashboard: "Tổng quan",
    login: "Đăng nhập",
    signup: "Đăng ký",
    logout: "Đăng xuất",
  },
  common: {
    closeNotification: "Đóng thông báo",
  },
  auth: {
    loginTitle: "Đăng nhập giáo viên",
    loginSubtitle: "Chào mừng thầy/cô quay trở lại với MemoQuiz",
    signupTitle: "Tạo tài khoản giáo viên",
    signupSubtitle: "Chỉ mất 30 giây để bắt đầu tạo bộ câu hỏi tự động",
    displayNameLabel: "Tên hiển thị của thầy/cô (tùy chọn)",
    displayNamePlaceholder: "Ví dụ: Cô Lan Anh",
    emailLabel: "Địa chỉ email",
    emailPlaceholder: "giaovien@truong.edu.vn",
    passwordLabel: "Mật khẩu",
    passwordPlaceholder: "Ít nhất 6 ký tự",
    loginButton: "Đăng nhập",
    loginSubmitting: "Đang đăng nhập...",
    signupButton: "Đăng ký tài khoản",
    signupSubmitting: "Đang tạo tài khoản...",
    noAccountPrompt: "Chưa có tài khoản?",
    noAccountLink: "Đăng ký ngay",
    hasAccountPrompt: "Đã có tài khoản?",
    hasAccountLink: "Đăng nhập",
    signupSuccessNotice:
      "Đăng ký thành công! Nếu hệ thống yêu cầu xác nhận email, vui lòng kiểm tra hộp thư của bạn trước khi đăng nhập.",
    validation: {
      emailRequired: "Vui lòng nhập địa chỉ email.",
      emailInvalid: "Địa chỉ email không đúng định dạng.",
      passwordMin: "Mật khẩu cần có ít nhất 6 ký tự.",
      displayNameMax: "Tên hiển thị không vượt quá 60 ký tự.",
    },
    errors: {
      invalidCredentials: "Email hoặc mật khẩu chưa chính xác. Vui lòng kiểm tra lại.",
      emailAlreadyRegistered: "Email này đã được đăng ký. Vui lòng chuyển sang đăng nhập.",
      emailNotConfirmed:
        "Tài khoản chưa được xác nhận email. Vui lòng kiểm tra hộp thư của bạn.",
      rateLimited: "Thao tác quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.",
      generic: "Đã có lỗi xảy ra trong quá trình xác thực. Vui lòng thử lại sau.",
    },
  },
  dashboard: {
    greetingPrefix: "Xin chào,",
    defaultTeacherName: "Thầy/Cô",
    subtitle: "Quản lý ngân hàng câu hỏi và đề kiểm tra của bạn tại đây.",
    createSetButton: "Tạo bộ câu hỏi mới",
    comingSoonToast:
      "Sắp có: Tính năng nạp đề cương và tách câu hỏi tự động sẽ mở ở bước tiếp theo!",
    comingSoonBadge: "Sắp có",
    myQuestionSetsTitle: "Bộ câu hỏi của tôi",
    setsCountUnit: "bộ đề",
    emptyState: {
      title: "Chưa có bộ câu hỏi nào",
      description:
        "Thầy/cô có thể tải lên file đề cương (.docx, .pdf, .xlsx) hoặc dán văn bản để hệ thống tự động tách câu hỏi và đáp án mà không cần gõ tay.",
      hint: "Bấm nút \"Tạo bộ câu hỏi mới\" để bắt đầu.",
    },
    setCard: {
      subjectFallback: "Chưa phân môn",
      gradePrefix: "Khối/Lớp:",
      gradeFallback: "Chung",
      createdAtPrefix: "Tạo ngày",
    },
    errors: {
      loadFailed: "Không thể tải danh sách bộ câu hỏi lúc này. Vui lòng tải lại trang.",
    },
  },
} as const;

export type ViDictionary = typeof vi;
