# Thư viện truyền thông và liên kết với Hoạt động hưởng ứng

## Phạm vi bước này
- Cán bộ đã được cấp quyền đăng ký **metadata nguồn Google Drive dạng tệp đơn**.
- Không có tải tệp lên server, sao chép Drive, tải hàng loạt hay đồng bộ tự động.
- Không cho đăng ký liên kết thư mục, URL tùy ý hoặc liên kết ngoài Drive.
- Người duyệt không được là người nhập; phê duyệt cần xác nhận thủ công
  quyền sử dụng/công bố, quyền riêng tư và nội dung phù hợp.
- API `POST /api/v1/admin/media/:id/review` cho phép `approve`, `reject`, `revoke`
  theo quyền và trạng thái. Không tái duyệt tư liệu đã thu hồi.
- Trang quản trị: `/admin/media`, yêu cầu OIDC/MFA và quyền phù hợp.

## Gắn tư liệu vào Hoạt động
- `GET/POST /api/v1/admin/activities/:id/assets` và giao diện
  `/admin/activities/:id/media`.
- Editor đề xuất gắn tư liệu đã được phê duyệt.
- Approver khác người đề xuất (và không phải người tạo hoạt động)
  phê duyệt liên kết hoặc ẩn liên kết đã duyệt.
- API `GET /api/v1/activities/:slug/media` chỉ đọc hoạt động đã công bố,
  liên kết đã duyệt và tư liệu **hiện còn** đủ điều kiện công khai.
- Danh sách hoạt động công khai có liên kết đến tư liệu đầu tiên đã duyệt.
- Không dùng cache dài hạn cho các trang/API này.

## Lưu ý về Google Drive
URL là đường dẫn tới bên thứ ba. Thu hồi trên website khiến website
ngừng hiển thị liên kết kể từ truy vấn mới, **không làm mất quyền truy cập
trực tiếp vào tài liệu Drive nếu chủ sở hữu đã chia sẻ trước đó**.
Cần thực hiện thu hồi/chỉnh quyền chia sẻ ngay tại Drive khi cần thiết.

Trường `safety_checked_at` của nguồn Drive là kết quả **kiểm tra
thủ công bởi cán bộ được ủy quyền**, không phải kết quả quét virus tự động.
Phê duyệt không đảm bảo người xem thực tế có thể mở tệp; phải kiểm tra
quyền chia sẻ Drive và căn cứ bản quyền trước khi công bố.

## Chưa triển khai
- Tải tệp và lưu trữ cách ly S3, ClamAV, kiểm tra MIME/hash và worker bản xem trước.
- Trình phát nội dung riêng tư, CDN có cơ chế thu hồi.
- Quét an toàn tự động cho nguồn Drive, quản trị bằng OIDC/MFA hoạt động thực tế.
- Đồng bộ Drive; tài khoản mặc định; hồ sơ hỗ trợ riêng tư.
- Kiểm thử end-to-end API đăng nhập và quyền với IdP thực.
Tài khoản quản trị phải được cấp theo quy trình và không dùng dữ liệu học sinh
hoặc hồ sơ nhạy cảm trong môi trường thử nghiệm.

Migration: chạy 001, 002, 003, 004 theo thứ tự.
Không ghép trực tiếp các đoạn SQL 005-011 đã từng soạn trong hội thoại.
