# Bảo mật quản trị: Google OIDC và RBAC

## Nhà cung cấp danh tính
Ứng dụng sử dụng Google OpenID Connect với tài khoản Google cá nhân (Gmail) hoặc
tài khoản Google đủ điều kiện khác. Không yêu cầu Google Workspace và không giới
hạn theo hosted domain. Ứng dụng chỉ xin các scope `openid`, `email`, `profile`.

## Xác minh danh tính
- Authorization Code Flow với PKCE S256, state và nonce.
- Chỉ chấp nhận issuer chuẩn `https://accounts.google.com`.
- Xác minh chữ ký ID Token bằng Google JWKS, thuật toán RS256, audience là
  đúng OAuth Client ID, cùng các claim thời hạn do thư viện JWT kiểm tra.
- Bắt buộc `sub` không rỗng, `email` hợp lệ về kiểu dữ liệu và
  `email_verified === true`; kiểm tra nonce khớp phiên đăng nhập.
- Nếu token có nhiều audience, `azp` phải khớp OAuth Client ID.
- Dùng cặp `issuer/sub` làm khóa định danh. Email không phải khóa cấp quyền.
- Không yêu cầu claim `hd` hoặc `acr`. Google OIDC ID Token không được dùng
  ở đây như bằng chứng rằng MFA đã được thực hiện trong phiên hiện tại.

## Cấp quyền quản trị
Không có đăng ký công khai, tự cấp quyền hoặc tài khoản mặc định. DBA/quản trị
có thẩm quyền phải tạo trước bản ghi `admin_users` khớp chính xác
`oidc_issuer/oidc_subject`, sau đó gán vai trò và phạm vi trong
`admin_role_assignments`. Người dùng Google chưa được cấp trước sẽ bị từ chối.
Không tự động cấp quyền dựa trên email.

## Cấu hình OAuth Client
- Application type: Web application.
- Authorized redirect URI khi chạy local:
  `http://localhost:3000/api/v1/admin/auth/callback`.
- Production phải dùng HTTPS và redirect URI trùng khớp tuyệt đối.
- Lưu Client Secret và `ADMIN_STATE_KEY_BASE64` trong secret manager hoặc
  biến môi trường riêng của máy chủ; không commit vào Git.
- Tạo state key 32 byte bằng `openssl rand -base64 32`.
- Google OAuth consent screen có thể ở chế độ Testing; chỉ test users đã thêm
  trong Google Auth Platform mới đăng nhập được.

## MFA
Khuyến nghị chủ tài khoản Google bật 2-Step Verification trong cài đặt Google.
Ứng dụng không tuyên bố đã cưỡng chế hoặc xác minh MFA theo từng phiên chỉ từ
Google OIDC ID Token. Với yêu cầu MFA bắt buộc ở cấp tổ chức, cần IdP/chính sách
quản trị có thể cung cấp bảo đảm xác thực phù hợp và được kiểm thử riêng.

## Phiên và RBAC
Phiên ngẫu nhiên 256 bit, cookie HttpOnly, SameSite=Lax, Secure trên HTTPS,
hash SHA-256 lưu trong PostgreSQL, thời hạn 8 giờ và có thể thu hồi.
Giữ nguyên phân quyền theo vai trò và phạm vi đơn vị/bản ghi. Không ghép quyền
của vai trò này với phạm vi của vai trò khác.

## Trạng thái nghiệm thu
Mã nguồn xác minh Google OIDC chưa đồng nghĩa đã kiểm thử với Google thật.
Trước khi vận hành cần cấu hình secret an toàn, chạy migration, provision tài khoản
quản trị theo issuer/sub, thử login/deny, kiểm tra session và RBAC trên staging.
Không dùng dữ liệu học sinh hoặc hồ sơ hỗ trợ thật trong môi trường thử nghiệm.
