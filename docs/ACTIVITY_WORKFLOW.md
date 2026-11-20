# Hoạt động hưởng ứng – API quản trị và quy trình phê duyệt

Đây là phiên bản 1 của workflow đã đưa vào GitHub. Không tạo dữ liệu hoạt động
thực hoặc tài khoản quản trị mặc định.

## Quyền
- Editor: tạo bản nháp, chỉnh sửa bản nháp, gửi duyệt, đánh dấu hoạt động đã tổ chức, nhập kết quả nháp.
- Approver: trả về bản nháp, phê duyệt, công bố, xác minh kết quả.
- Quyền luôn kiểm tra ở máy chủ theo vai trò **và đúng phạm vi** toàn hệ thống/đơn vị/bản ghi.
- Người tạo hoặc gửi duyệt không được phê duyệt hoặc tự công bố hoạt động.
- Người nhập kết quả không được tự xác minh số liệu đã nhập.

## Chuyển trạng thái
`draft -> pending -> approved -> published`.
Approver có thể `return` từ `pending` hoặc `approved` về `draft`.
Không cho sửa trực tiếp hoạt động sau công bố trong phiên bản này.
Hoạt động đã công bố có thể đánh dấu `completed` sau thời điểm bắt đầu;
chỉ khi đó editor mới lưu kết quả nháp và approver mới xác minh.
Kết quả đã xác minh là bất biến trong phiên bản 1. Việc chỉnh sửa số liệu
đã xác minh cần thủ tục đính chính riêng trong tương lai, không bypass API.

## API
- `GET /api/v1/admin/organizations`: đơn vị mà editor được phép tạo hoạt động.
- `GET /api/v1/admin/activities?status=all&page=1`: danh sách theo quyền xem, tối đa 20 bản ghi/trang.
- `POST /api/v1/admin/activities`: tạo bản nháp.
- `PATCH /api/v1/admin/activities/:id`: chỉnh sửa bản nháp.
- `POST /api/v1/admin/activities/:id/transition`: submit, return, approve, publish, complete.
- `POST /api/v1/admin/activities/:id/results`: save hoặc verify.
- `/admin/activities`: giao diện quản trị khi đã xác thực.

Mọi lệnh ghi kiểm tra Origin, phiên làm việc, quyền và trạng thái trên
máy chủ; dùng PostgreSQL transaction + khóa hàng `FOR UPDATE` và ghi audit.
Người duyệt phải có quyền độc lập. Không dựa vào việc ẩn nút của giao diện.

## Kiểm thử
GitHub Actions chạy TypeScript, build Next.js và các SQL test trên PostgreSQL 16.
SQL test kiểm tra phạm vi đơn vị, điều kiện công khai và ràng buộc người nhập
khác người xác minh. **Chưa kiểm thử end-to-end với IdP OIDC và MFA thật,
chưa kiểm thử tải lớn và chưa bảo đảm an toàn vận hành**.

## Những điều chưa hỗ trợ
- Đăng nhập chưa chạy thực tế cho đến khi cấu hình IdP/MFA và cấp user chính thức.
- Chưa có giao diện quản lý danh sách tổ chức hoặc cấp tài khoản.
- Chưa hỗ trợ hoãn/hủy và đính chính kết quả sau xác minh.
- Chưa tích hợp ảnh/video theo phê duyệt liên kết. 
- Không đưa thông tin học sinh, dữ liệu riêng tư hoặc hồ sơ hỗ trợ vào bản demo.
