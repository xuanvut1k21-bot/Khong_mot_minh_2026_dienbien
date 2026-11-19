# Staging – kiểm tra điều kiện và hướng dẫn vận hành

**Trạng thái: mã kiểm tra đã được bổ sung, chưa triển khai thật.** Không có máy
chủ, DNS, database, OIDC/MFA hoặc dịch vụ khảo sát nào được tự động cấp phát.

## Tách riêng môi trường
1. Dùng hostname và chứng chỉ HTTPS staging riêng, không dùng hostname production.
   Reverse proxy chỉ chấp nhận IP nguồn từ proxy đáng tin cho rate-limit;
   không tin X-Forwarded-For từ client.
2. Dùng PostgreSQL staging riêng, TLS xác thực hostname với
   sslmode=verify-full, database account quyền tối thiểu; phân quyền tài
   khoản chạy migrations riêng với tài khoản ứng dụng. Backup/restore phải
   được kiểm thử trước khi cập nhật schema. Không sao chép dữ liệu thật.
3. Tạo OIDC client staging với redirect URI chính xác tại
   /api/v1/admin/auth/callback. Bật MFA thật tại IdP, kiểm tra claim
   ACR khi đăng nhập và cấp vai trò admin_users theo phê duyệt.
4. Chỉ sử dụng học viên, câu hỏi, ảnh và hồ sơ giả lập trong staging.
   Cấm đưa dữ liệu thật của người chưa thành niên vào môi trường chưa
   được nghiệm thu quyền riêng tư.

## Công tắc ban đầu
Giữ false: MEDIA_IMAGE_UPLOADS_ENABLED, MEDIA_PDF_PREVIEW_ENABLED,
MEDIA_VIDEO_POSTER_ENABLED, TRAINING_REGISTRATION_ENABLED,
TRAINING_EXAM_ENABLED, TRAINING_SURVEY_WEBHOOK_ENABLED,
TRAINING_SURVEY_LAUNCH_ENABLED, TRAINING_RETENTION_PURGE_ENABLED
và TRAINING_EDGE_RATE_LIMIT_READY.

Không tự tạo tài khoản quản trị, không mở form nhập thông tin người học
và không chạy job xóa dữ liệu trên production. 180 ngày chỉ là tham số
kỹ thuật mặc định, thời hạn chính thức phải được đơn vị phê duyệt.

## GitHub Environment
Vào repository → Settings → Environments → New environment: staging.
Nếu được hỗ trợ, bật Required reviewers và phân quyền quản trị riêng.
Environment staging yêu cầu ba Secrets:
- STAGING_DATABASE_URL
- STAGING_OIDC_CLIENT_SECRET
- STAGING_ADMIN_STATE_KEY_BASE64

Đặt các Variables không mật: STAGING_APP_BASE_URL,
STAGING_OIDC_ISSUER, STAGING_OIDC_CLIENT_ID,
STAGING_OIDC_AUTHORIZATION_ENDPOINT, STAGING_OIDC_TOKEN_ENDPOINT,
STAGING_OIDC_JWKS_URI và STAGING_OIDC_REQUIRED_ACR.

Không ghi Secrets vào tài liệu, bình luận PR hay source code.
GitHub-hosted runners phải truy cập database staging theo chính sách
mạng an toàn. Nếu DB nằm trong mạng nội bộ, dùng runner self-hosted
được kiểm soát hoặc chạy preflight bên trong mạng đó. Không mở DB công
khai chỉ để kiểm thử.

## Kiểm tra read-only
- npm run staging:test: unit test quy tắc bằng dữ liệu tổng hợp.
- npm run staging:check: kiểm tra cấu hình và báo cáo pass/fail.
- npm run staging:check -- --check-db: mở kết nối chỉ đọc để xác nhận
  PostgreSQL và sự tồn tại của các bảng nền tảng sau migrations 001–010.
- GitHub Actions: Staging preflight (manual, no deploy), nhập CHECK_STAGING,
  chọn nhánh đã phê duyệt. Workflow không chạy migrations/deploy.
- GET /api/health/live: chỉ kiểm tra tiến trình.
- GET /api/health/ready: trả 200 khi DB và bảng nền tảng tồn tại, 503 nếu
  DB/schema lỗi. Hai API không trả dữ liệu cá nhân hay chi tiết kết nối.

Công cụ kiểm tra định dạng secret và URL, nhưng **không chứng minh
IdP đã thực thi MFA, TLS đã chống mọi lỗi, backup đã restore được hay WAF
đã cấu hình**. Phải xác minh những điều này với hạ tầng thực.

## Quy trình triển khai thử nghiệm do quản trị viên thực hiện
1. Rà soát và merge chuỗi PR phụ thuộc theo thứ tự sau khi tất cả đã
   được code review; không merge vì CI xanh mà thiếu review bảo mật.
2. Chuẩn bị hosting Next.js Node 22+, HTTPS proxy, database và IdP riêng.
   Quản lý Secrets qua secret manager; build từ commit SHA được duyệt.
3. Chạy migrations 001–010 bằng tài khoản riêng, trên database staging
   sau khi đã backup và có phương án khôi phục. SQL tests chạy trên DB
   tổng hợp riêng, không chạy trên database có thông tin thật.
4. Chạy preflight, kiểm tra /api/health/live và /api/health/ready.
   Kiểm tra cookie Secure/HttpOnly/SameSite, no-store cho API nhạy cảm,
   role-based access, MFA và đường dẫn đăng nhập/đăng xuất.
5. Tập diễn tập sự cố database mất kết nối (readiness phải trả 503),
   khôi phục backup, thu hồi session/role, giám sát log 4xx/5xx. CSP cần
   được xây/test phù hợp Next.js thay vì bật mặc định làm hỏng SSR.
6. Chỉ khi hoàn thành kiểm toán dữ liệu cá nhân, nhà cung cấp khảo sát
   thật, học liệu 9 phiên và ngân hàng 90 câu đã duyệt, người có thẩm quyền
   mới xem xét mở riêng từng chức năng cho người dùng.

## Go/no-go và rollback
Chặn công bố nếu thiếu TLS, xác minh MFA thật, rate-limit tại ingress,
hạ tầng PostgreSQL an toàn, sao lưu khôi phục đã diễn tập, kiểm soát
quyền quản trị, chính sách lưu/xóa dữ liệu người học hoặc nhân sự xử lý
sự cố. Không dùng dữ liệu trẻ em thật trước khi đầy đủ điều kiện.

Các migration hiện chưa có rollback tự động. Muốn rollback phải có backup
và quy trình phục hồi schema đã được thử, không đảo SQL bằng phỏng đoán.
Hạ phiên bản ứng dụng chỉ an toàn khi schema còn tương thích.

**Không có triển khai máy chủ hay cấu hình dịch vụ thật được thực hiện
trong PR này.**
