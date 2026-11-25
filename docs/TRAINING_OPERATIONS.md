# Giai đoạn 4.5 – An toàn vận hành và vòng đời dữ liệu Đào tạo

## Các giới hạn được thực thi trong PostgreSQL
- Đăng ký: 300 đăng ký được xét trong mỗi cửa sổ 10 phút toàn hệ thống.
  Đây là **phanh an toàn tổng**, không thay thế chống bot theo IP,
  thiết bị, tài khoản hoặc edge. Việc vượt ngưỡng trả HTTP 429 và
  Retry-After: 600. Học viên không được lưu khi đã vượt ngưỡng.
- Mở lại hoặc tạo bài thi: 12 yêu cầu/phút/học viên.
- Nộp bài thi: 30 yêu cầu/phút/học viên.
  Hai giới hạn trả HTTP 429, Retry-After: 60.
- Bộ đếm lưu trong PostgreSQL bằng upsert nguyên tử nên có hiệu lực trên
  các tiến trình Next.js dùng chung database. Đếm cả yêu cầu không đạt
  điều kiện nghiệp vụ. Giới hạn là theo cửa sổ chứ không giới hạn tổng số
  lượt thi; học viên vẫn có thể làm lại không giới hạn.
- Quota ở tầng ứng dụng **không bảo vệ được** request vô danh đến
  trước bước kiểm tra PostgreSQL (đặc biệt chống spam đăng ký/DoS).
  Triển khai production cần thêm reverse proxy/gateway đáng tin cậy,
  chống bot phù hợp, WAF/CDN, cấu hình HTTPS, hạn mức trên IP nguồn được
  xác thực bởi gateway; **không tin tùy tiện X-Forwarded-For do client gửi**.

## Công tắc mở hệ thống
\`TRAINING_EDGE_RATE_LIMIT_READY=false\` theo mặc định.
Trong Node.js production, đăng ký và thi bị khóa khi công tắc này chưa
được một người vận hành có thẩm quyền chuyển true **sau khi cấu hình
và thử nghiệm hạ tầng chống lạm dụng**. Công tắc không tự triển khai
rate limiting ở edge, không nên thay thế kiểm toán bảo mật.
Đăng ký và thi vẫn có hai công tắc riêng
\`TRAINING_REGISTRATION_ENABLED\`, \`TRAINING_EXAM_ENABLED\`.
Việc tạm đóng đăng ký mới không phải lý do tự đóng bài thi của học viên
đã đăng ký. Ngược lại, đóng thi không ảnh hưởng việc học/xóa dữ liệu.

## Dọn dẹp và quyền xóa
Script: \`npm run training:maintenance\` (dry-run; **chỉ in số lượng**).
Không có thông tin cá nhân, token, bài làm hoặc đáp án trong log.
Sau khi có chính sách lưu trữ được phê duyệt, có thể chạy
\`TRAINING_RETENTION_PURGE_ENABLED=true npm run training:maintenance -- --apply\`
trong backend worker riêng, có quyền CSDL tối thiểu, lịch chạy và giám sát.
Tuyệt đối không bật từ trình duyệt hay API công khai.

Khi --apply:
1. Xóa phiên học viên hết hạn hoặc bị thu hồi **quá 7 ngày**.
2. Xóa mã khảo sát chưa sử dụng đã hết hạn **quá 7 ngày**.
   **Không xóa mã đã dùng**, vì kết quả khảo sát đã xác minh còn tham chiếu
   đến nó để mở bài thi.
3. Đổi những bài thi in_progress quá hạn thành expired, không chấm điểm.
4. Xóa tối đa 100 hồ sơ học viên trong một lượt khi tài khoản được tạo
   từ ít nhất \`TRAINING_LEARNER_RETENTION_DAYS\` ngày trước và không có
   phiên hoạt động hoặc hoạt động học/thi/khảo sát trong thời hạn đó.
   Khóa ngoại CASCADE xóa phiên đăng nhập, mã xác minh và lượt thi liên quan.
   Các bản ghi dữ liệu đối chiếu không còn cần giữ sẽ được xử lý theo
   chính sách đã phê duyệt. Lặp theo lịch để xóa hết backlog.

\`TRAINING_LEARNER_RETENTION_DAYS\` nhận giá trị 180–3650; mặc định 180
nhưng **công tắc xóa tắt**. Đây là đề xuất kỹ thuật để tổ chức lựa chọn
theo pháp luật và chính sách quản trị của mình, **không khẳng định pháp
luật bắt buộc lưu đúng 180 ngày**. Phải thông báo rõ thời hạn tới người học,
quy định điều kiện cho người dưới 18 tuổi và thủ tục xử lý yêu cầu riêng.
Người học có thể yêu cầu xóa ngay trong tài khoản bằng DELETE /me trước
khi hết thời hạn này.

## Hướng dẫn nghiệm thu trước production
- Xác minh OIDC/MFA, HTTPS, trusted proxy, cookie Secure/HttpOnly và
  chính sách Content Security Policy phù hợp.
- Kiểm thử lưu lượng đăng ký đồng thời, đa IP/multi-node, hạn mức theo
  phía gateway và tình huống database quá tải (fail-closed).
- Kiểm tra điều kiện 9 học liệu và 90 câu đã duyệt, khảo sát từ provider
  thật qua callback có chữ ký (không phải đánh dấu chỉ do quét QR).
- Chạy kiểm thử với tài khoản/thông tin tổng hợp, đo khả năng khôi phục
  sau lỗi, không sử dụng dữ liệu trẻ em thật ở staging.
- Kiểm toán thời hạn giữ dữ liệu cá nhân và thiết lập sự đồng ý/thông báo
  phù hợp trước khi thu họ tên và trường học.
- Chỉ chạy maintenance trên database thích hợp và sau sao lưu được kiểm tra.
  Quy trình dry-run → người duyệt → --apply → kiểm tra báo cáo số lượng.

## Phạm vi CI
TypeScript, unit, Next.js build, PostgreSQL migration/test và
HTTP tích hợp bằng học viên, trường, bài thi, callback HMAC giả lập.
Kiểm thử maintenance riêng xác nhận dry-run không sửa dữ liệu, khi bật
--apply có thể xóa dữ liệu cũ nhưng giữ được kết quả khảo sát đã dùng.
**CI thành công không đồng nghĩa đã kiểm thử ở hạ tầng production hoặc
đã có nhà cung cấp khảo sát thực tế.**
