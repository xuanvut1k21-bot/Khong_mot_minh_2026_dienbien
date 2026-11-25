# KHÔNG MỘT MÌNH 2026 – KẾT NỐI KHÔNG TỔN THƯƠNG

Website chiến dịch tại Điện Biên, đang phát triển. **Không phải cổng tiếp nhận hỗ trợ hoặc thi chính thức** ở giai đoạn nền tảng.

## Chạy website

Yêu cầu Node.js 22 trở lên. Trong thư mục repository:

    npm install
    npm run dev

Mở http://localhost:3000. Kiểm tra bằng:

    npm run typecheck
    npm run build

## Phân hệ

- Trang chủ: /
- Lan tỏa chiến dịch: /lan-toa (Dance Challenge + Avatar Frame xử lý cục bộ)
- Cẩm nang: /cam-nang (hai nguồn PDF gốc)
- Hoạt động hưởng ứng: /hoat-dong (chưa có dữ liệu công bố)
- Đào tạo giảng viên nguồn: /dao-tao (chưa mở thi)
- Thư viện: /thu-vien (kho nguồn, chưa đồng bộ)
- Góc an toàn mạng: /an-toan-mang
- Quiz – Quà: /quiz (chỉ là lượt chơi thử cục bộ)
- Kết nối – Hỗ trợ: /ho-tro (đường dây 111; biểu mẫu chưa kích hoạt)
- Quản trị – Thống kê: /admin (chưa mở đăng nhập)

## Bộ nhận diện

Xanh dương #2B00D0, cam #FD0100, trắng ngà #E8F2F7. Không dùng vàng làm màu chủ đạo. Quiz dùng màu chữ đậm #192034 để bảo đảm tương phản.

## Trạng thái

Đây là giai đoạn 1: giao diện Next.js có các đường dẫn thật và chức năng cục bộ được ghi nhãn rõ ràng. Backend PostgreSQL, API có phân quyền, quét tệp, kiểm duyệt, ngân hàng câu hỏi và hệ thống hỗ trợ bảo mật sẽ triển khai sau, **không được ngầm coi các đoạn mã trong hội thoại là mã đã có trong repository**.

Tuyệt đối không nhập dữ liệu học sinh hoặc hồ sơ nhạy cảm vào bản thử. Không đưa thông tin bí mật vào repository hay commit.

## Cơ sở dữ liệu công khai

Đã có API chỉ đọc cho Hoạt động và Thư viện, quy trình ghi và duyệt hoạt động được mô tả bên dưới. Hướng dẫn PostgreSQL: [docs/PUBLIC_CONTENT.md](docs/PUBLIC_CONTENT.md).

## Đăng nhập quản trị (đang cấu hình)

Đã có mã khung Google OIDC + PKCE và phân quyền scoped RBAC, mặc định khóa. Google OIDC không được coi là bằng chứng MFA theo từng phiên; xem [docs/ADMIN_AUTH.md](docs/ADMIN_AUTH.md).
Xem [docs/ADMIN_AUTH.md](docs/ADMIN_AUTH.md). Không có tài khoản/mật khẩu mẫu.

## Quy trình duyệt hoạt động

Trang `/admin/activities` chỉ phục vụ tài khoản quản trị đã được xác thực và cấp phạm vi quyền. Hoạt động nhập dưới dạng bản nháp, gửi duyệt, phê duyệt bởi người khác, công bố; kết quả chỉ hiển thị sau xác minh độc lập. Xem [docs/ACTIVITY_WORKFLOW.md](docs/ACTIVITY_WORKFLOW.md).

## Kiểm duyệt Thư viện và gắn tư liệu

Đã có giao diện `/admin/media` cho nguồn Google Drive được kiểm duyệt và `/admin/activities/:id/media` cho đề xuất/duyệt liên kết. Hướng dẫn tại [docs/MEDIA_LIBRARY.md](docs/MEDIA_LIBRARY.md). Chưa có upload tệp thực hoặc tự đồng bộ Drive.

## Tải ảnh riêng tư (mặc định tắt)

Đã có pipeline presigned S3 POST → vùng cách ly → ClamAV → bản WebP được tái mã hóa → cán bộ phê duyệt → API phân phối nội bộ. Không hỗ trợ PDF/video trong bước này. Xem [docs/SAFE_MEDIA_UPLOADS.md](docs/SAFE_MEDIA_UPLOADS.md).

## Ảnh bìa PDF/video (chưa bật)
Đã có quy trình nhận PDF ≤25 MB, MP4 ≤80 MB vào vùng cách ly,
tạo **ảnh bìa WebP tĩnh** qua Poppler/FFmpeg trong worker riêng.
Chỉ ảnh bìa được kiểm duyệt có thể truy cập; PDF/video gốc không được
phục vụ trong website. Xem [docs/PDF_VIDEO_PREVIEWS.md](docs/PDF_VIDEO_PREVIEWS.md).

## Đào tạo giảng viên nguồn (mặc định khóa)
Bổ sung 9 vị trí phiên học chưa công bố, API đăng ký tối thiểu họ tên/trường,
xác nhận hai khảo sát bằng webhook có chữ ký và bài thi 20 câu/15 phút
từ đúng 90 câu đã duyệt, chấm điểm tại máy chủ, đạt từ 16 câu.
Không có học liệu, câu hỏi hoặc người học giả trong production.
Xem [docs/TRAINING_FOUNDATION.md](docs/TRAINING_FOUNDATION.md).

## Biên soạn và duyệt nội dung Đào tạo
Giao diện nội bộ tại `/admin/training`. Có hai vai trò phân quyền toàn chương
trình `training_editor` và `training_approver`, không mặc định cấp cho admin kỹ thuật.
Nhập 9 học liệu và ngân hàng câu hỏi, gửi duyệt độc lập và lưu nhật ký.
Không nhập sẵn dữ liệu thật hoặc câu hỏi giả. Xem
[docs/TRAINING_EDITORIAL.md](docs/TRAINING_EDITORIAL.md).
