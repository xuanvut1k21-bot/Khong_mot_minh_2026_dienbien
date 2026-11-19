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

Đã có API chỉ đọc cho Hoạt động và Thư viện, chưa có API quản trị ghi dữ liệu. Hướng dẫn PostgreSQL: [docs/PUBLIC_CONTENT.md](docs/PUBLIC_CONTENT.md).

## Đăng nhập quản trị (đang cấu hình)

Đã có mã khung OIDC + PKCE/MFA ACR và phân quyền scoped RBAC, mặc định khóa.
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

## Khảo sát QR phiên 1 và 9
Đã có QR tĩnh không chứa dữ liệu người học, phát hành token tương quan
dùng một lần khi mở biểu mẫu và xác nhận qua webhook HMAC từ provider
được ủy quyền. Mặc định khóa đến khi xác minh provider thật.
Chi tiết [docs/TRAINING_SURVEY_QR.md](docs/TRAINING_SURVEY_QR.md).

## Kiểm thử hành trình Đào tạo (không có dữ liệu học viên thật)

Sau migration 001–009 trong một PostgreSQL dùng riêng cho CI,
`npm run training:journey` chạy Next.js ở chế độ phát triển,
tạo **người học/câu hỏi giả** và mô phỏng server-to-server callback khảo sát
có chữ ký. Kiểm tra đăng ký, QR, 2 khảo sát, điều kiện mở thi,
đề 20 câu, mức đạt 16/20, làm lại và quyền xóa dữ liệu.
Không sử dụng URL khảo sát hoặc HMAC secret thử nghiệm khi vận hành thật.

## An toàn vận hành Đào tạo
Tăng cường giới hạn đăng ký chung ở PostgreSQL (300/10 phút), mở đề
(12 yêu cầu/phút/học viên), nộp bài (30 yêu cầu/phút/học viên);
không giới hạn tổng số lượt thi qua các phiên. Production chỉ mở khi
đã xác nhận chống bot ở reverse proxy/edge. Có công cụ dọn dữ liệu
tạm hết hạn và chính sách xóa học viên không còn hoạt động,
**không tự chạy và mặc định dry-run**. Xem
[docs/TRAINING_OPERATIONS.md](docs/TRAINING_OPERATIONS.md).

## Chuẩn bị staging (không tự triển khai)
Chạy `npm run staging:test` để kiểm thử quy tắc cấu hình. `npm run staging:check` chỉ báo cáo điều kiện và `npm run staging:check -- --check-db` kiểm tra PostgreSQL read-only. Xem `docs/STAGING_DEPLOYMENT.md`. Chức năng học viên vẫn tắt.

## Gói container staging chưa triển khai

Bổ sung Dockerfile, compose.staging.yml, .dockerignore và Next.js
standalone output. Image chạy không có quyền root, không chứa .env
hoặc secrets, không dùng PostgreSQL cài sẵn. Compose buộc
có file .env.staging chỉ trên máy quản trị (được .gitignore bỏ qua),
bind cổng về 127.0.0.1:3000, khóa các chức năng nhạy cảm và dùng
giới hạn tài nguyên. Chỉ chạy sau khi đã có HTTPS proxy và PostgreSQL
staging riêng. CI tự build, chạy thử và xóa container thử;
không đẩy lên registry hay đưa lên máy chủ. Xem tài liệu staging.

## Khóa phiên bản thư viện và kiểm tra bảo mật
Có `package-lock.json` tạo bằng CI và xác minh trùng `package.json`.
GitHub Actions và Docker đều sử dụng `npm ci` để cài theo lockfile;
CI chạy `npm audit --omit=dev --audit-level=high` và sẽ báo lỗi nếu
phát hiện cảnh báo mức cao/nghiêm trọng của dependency production.
Dependabot được cấu hình tạo PR cập nhật, không tự merge.
Chi tiết xem `docs/DEPENDENCY_SECURITY.md`.

## Kiểm tra CVE của Docker và pin SHA GitHub Actions
Ba giai đoạn Docker được pin chung đến image digest được GitHub Actions
xác minh; checkout/setup-node và Trivy được pin SHA để tránh tag di động.
CI chặn CVE OS ở mức HIGH/CRITICAL qua Trivy, không bỏ qua lỗi.
Chi tiết: `docs/DEPENDENCY_SECURITY.md`.
