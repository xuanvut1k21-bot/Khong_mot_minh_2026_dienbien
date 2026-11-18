export const brand = {
  blue: "#2B00D0",
  orange: "#FD0100",
  offwhite: "#E8F2F7"
} as const;

export type Section = {
  path: string;
  title: string;
  short: string;
  icon: string;
  description: string;
};

export const sections: Section[] = [
  { path: "/lan-toa", title: "Lan tỏa chiến dịch", short: "Lan tỏa", icon: "◉", description: "Dance Challenge Lướt Chạm và công cụ Avatar Frame tại trình duyệt." },
  { path: "/cam-nang", title: "Cẩm nang 2026", short: "Cẩm nang", icon: "▤", description: "Đọc hai cẩm nang chính thức; triển khai đọc theo chương sau khi đối chiếu PDF." },
  { path: "/hoat-dong", title: "Các hoạt động hưởng ứng", short: "Hoạt động", icon: "▦", description: "Tin bài, lịch và kết quả đã được cán bộ quản trị phê duyệt." },
  { path: "/dao-tao", title: "Đào tạo giảng viên nguồn", short: "Đào tạo", icon: "▣", description: "9 phiên học, 2 khảo sát và bài kiểm tra cuối chương trình." },
  { path: "/thu-vien", title: "Thư viện truyền thông", short: "Thư viện", icon: "▧", description: "Tư liệu chiến dịch và tài nguyên sử dụng đúng quyền." },
  { path: "/an-toan-mang", title: "Góc an toàn mạng", short: "An toàn mạng", icon: "⬡", description: "Kiến thức và hướng dẫn xử lý tình huống trực tuyến." },
  { path: "/quiz", title: "Quiz – Quà", short: "Quiz – Quà", icon: "★", description: "Hai mức độ chơi; bản thử không ghi kết quả chính thức." },
  { path: "/ho-tro", title: "Kết nối – Hỗ trợ", short: "Hỗ trợ", icon: "♡", description: "Thông tin liên hệ hỗ trợ đáng tin cậy và Tổng đài 111." },
  { path: "/admin", title: "Quản trị – Thống kê", short: "Quản trị", icon: "⚙", description: "Quản lý nội dung, phân quyền và báo cáo dành cho cán bộ được chỉ định." }
];

export const official = {
  brand: "https://drive.google.com/file/d/1YxH59DdnT47DlrTy7lHhZuOi5g4gh94o/view",
  danceTutorial: "https://drive.google.com/file/d/1ggn61ZdzDVEdEs-NhRj47lDvHfxu9ZiU/view",
  danceSample: "https://drive.google.com/file/d/1_1iTf7XVz473Lvxuq7V7xihZyDxUNDUN/view",
  themeSong: "https://drive.google.com/file/d/1XBKkyf1CLjGZOHpsHUEXYmBR7MpElW4h/view",
  frame: "https://drive.google.com/file/d/1eWQ9qwT6f5jaVbz7ZVgT741ampJR-ARG/view",
  mediaHandbook: "https://drive.google.com/file/d/1cluJazwKJj-K6dcquVPI1P0mg5U4Wxll/view",
  educationHandbook: "https://drive.google.com/file/d/1MPsDj2YtVJbjSfqpoz_Ig4j7FFQprIw_/view",
  mediaFolder: "https://drive.google.com/drive/folders/1SD49htlGKr-M0qyKKmRJOq-e9tRh17_j",
  localPhotos: "https://drive.google.com/drive/folders/1lMwM5K4xo7AODSgf2y43_r-05moUOsL8",
  hotline: "https://tongdai111.vn/"
} as const;

export const risks = [
  { title: "Tiếp xúc không an toàn", body: "Cẩn trọng khi người lạ tìm cách làm quen, dụ dỗ, gây áp lực hoặc yêu cầu giữ bí mật." },
  { title: "Nội dung gây tổn thương", body: "Dừng xem nội dung không phù hợp, không chuyển tiếp và tìm người lớn đáng tin cậy." },
  { title: "Bắt nạt trực tuyến", body: "Không đáp trả bằng xúc phạm, sử dụng chức năng báo cáo và tìm hỗ trợ." },
  { title: "Giả mạo và lừa đảo", body: "Không cung cấp mật khẩu, mã xác minh hoặc dữ liệu riêng tư cho người yêu cầu qua tin nhắn." },
  { title: "Nguy cơ từ AI", body: "Hình ảnh, giọng nói và thông tin có thể bị giả mạo. Xác minh qua kênh đáng tin cậy." }
] as const;
