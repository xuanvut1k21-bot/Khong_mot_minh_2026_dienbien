# Bảo mật quản trị: OIDC, MFA và RBAC

## Giai đoạn hiện tại
Bổ sung migration `002_admin_auth.sql`, OIDC Authorization Code + PKCE, nonce/state,
xác minh chữ ký ID Token qua JWKS, bắt buộc claim ACR do IdP định nghĩa là MFA,
phiên làm việc 8 giờ được lưu dạng SHA-256 trong PostgreSQL và có thể thu hồi.
Không có chức năng đăng ký công khai, mật khẩu mặc định, hoặc cấp quyền mặc định.

**Chưa cấu hình IdP/cơ sở dữ liệu vận hành thì trang quản trị tự khóa**.
Dù mã đã build được, chưa thể coi đăng nhập thực tế và MFA đã nghiệm thu
cho đến khi kiểm thử với đúng nhà cung cấp danh tính.

## Điều kiện trước khi vận hành
1. Người phụ trách hạ tầng chọn IdP OIDC đáng tin cậy, cấu hình MFA bắt buộc.
2. IdP phải trả claim `acr` đúng với `OIDC_REQUIRED_ACR` cho lần đăng nhập đã MFA.
   Không điền một giá trị ACR không có bảo đảm MFA.
3. Cấu hình ứng dụng confidential client (client-secret-basic), callback chính xác:
   `https://YOUR_HOST/api/v1/admin/auth/callback`.
4. Cấu hình đủ biến trong `.env.example` nhưng **lưu giá trị thật trong secret manager**,
   không commit .env.local hoặc secret vào GitHub.
5. Tạo khóa ngẫu nhiên 32 byte: `openssl rand -base64 32` và lưu vào
   `ADMIN_STATE_KEY_BASE64`. Không sử dụng ví dụ hoặc mật khẩu ngắn.
6. Dùng HTTPS tại `APP_BASE_URL` ngoài môi trường localhost.
7. Chạy migration theo thứ tự:
   `migrations/001_public_content.sql` rồi `migrations/002_admin_auth.sql`.
8. Chỉ DBA/quản trị có thẩm quyền mới thêm bản ghi `admin_users` và
   `admin_role_assignments` sau khi đối chiếu `iss/sub` với IdP.
   Không dùng email làm định danh tin cậy thay cho `sub`.

## Quyền theo phạm vi
- `technical_admin` quản lý tài khoản và vai trò; **không tự động** có quyền duyệt
  nội dung, xem tình huống hỗ trợ hay phê duyệt tư liệu.
- `activity_editor`: xem/sửa/gửi duyệt hoạt động theo phạm vi được gán.
- `activity_approver`: duyệt/công bố/xác minh kết quả hoạt động.
- `media_editor`: xem và đăng ký tài nguyên.
- `media_approver`: xem/duyệt/thu hồi tài nguyên.
- `content_viewer`: xem bản nháp nội bộ theo phạm vi cấp.
- Mỗi assignment chứa vai trò cùng phạm vi: toàn hệ thống, đơn vị, hoặc bản ghi.
  Không ghép quyền của vai trò A với phạm vi của vai trò B.

## Giới hạn bảo mật đã xác định
- MFA phải được **thiết lập và kiểm tra thực tế trên IdP**; không thể tự cấu hình
  bằng cách chỉ bật một biến môi trường ở website.
- Chưa có giao diện tạo tài khoản, thay đổi quyền, API nhập/sửa/duyệt hoạt động.
- Không lưu token OAuth của IdP trong cookie; cookie chứa ngẫu nhiên 256 bit,
  cơ sở dữ liệu chỉ lưu hash. Logout thu hồi phiên trên máy chủ.
- Chưa thực hiện kiểm thử đăng nhập IdP thực tế, kiểm thử tấn công, kiểm tra
  lưu trữ secret và rà soát phân quyền ở toàn bộ API quản trị.
- Không dùng dữ liệu học sinh hoặc trường hợp cần hỗ trợ trong môi trường thử nghiệm.
