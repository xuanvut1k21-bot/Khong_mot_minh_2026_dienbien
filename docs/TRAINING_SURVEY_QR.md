# Giai đoạn 4.3 – QR khảo sát có xác minh

## Đã bổ sung trong mã nguồn
- QR tĩnh cho phiên 1 và 9: dẫn đến \`/dao-tao/khao-sat/1\`
  hoặc \`/dao-tao/khao-sat/9\` trên website chiến dịch.
  **QR không chứa tên, trường, ID người học, token hoặc cookie.**
- Mỗi học viên đã đăng ký, nếu phiên học tương ứng đã được công bố,
  có thể yêu cầu một lượt khảo sát. Server tạo token 256 bit, chỉ lưu
  SHA-256 vào PostgreSQL, ràng buộc chính xác người học + phiên khảo sát
  + thời điểm hết hạn (sau 2 giờ).
- Server đưa token \`km_ref\` sang liên kết khảo sát HTTPS của đơn vị được
  cấu hình. **Token là bí mật tương quan dùng một lần**; không chuyển ID,
  họ tên hay trường học cho provider qua URL.
- Sau khi xác thực nhà cung cấp đã nhận **một bài nộp hoàn chỉnh**,
  provider gọi webhook ký HMAC-SHA256 trong vòng 5 phút so với timestamp:
  \`POST /api/v1/training/survey-verified\`.
- Webhook tra SHA-256 token, khóa hàng bằng \`FOR UPDATE\`, xác nhận phiên,
  thời hạn, người học, trạng thái học liệu và hạn chế xác nhận trùng.
  Chỉ lúc đó kết quả mới được đưa vào \`training_verified_surveys\`.
- Học viên có thể xem trạng thái xác minh trên giao diện Đào tạo.
  Mở form, quét QR hoặc tạo token **không** xác nhận hoàn thành.
- Giới hạn tạo lượt: tối đa 6 lượt mỗi 24 giờ và tối thiểu 60 giây
  giữa các lượt cho cùng học viên + phiên.
- Khi học viên xóa đăng ký, token và bản ghi khảo sát liên quan được xóa
  bằng khóa ngoại \`ON DELETE CASCADE\`.
- API tổng quan không còn trả UUID học viên, chỉ trả \`registered: true/false\`.

## Hợp đồng tích hợp provider – CHƯA CÓ PROVIDER THẬT
Chỉ triển khai adapter, **không tuyên bố có khảo sát đã kết nối hoặc
có phản hồi thật được xác minh**. Nhà cung cấp cần:
1. Hỗ trợ nhận query param \`km_ref\` mà không sửa token;
2. Tự kiểm tra bài khảo sát đã thực sự được hoàn thành/nộp một lần;
3. Sau khi xác minh, POST JSON có các trường:
   \`eventId\`, \`correlationToken\`, \`lessonNumber\` (1 hoặc 9),
   \`responseReference\`, \`submissionVerified: true\`;
4. Gửi \`x-km-timestamp\` là Unix seconds và \`x-km-signature\` là
   HMAC-SHA256 hex của chuỗi \`timestamp + "." + raw_json_body\`,
   khóa ký giữ bí mật trên server provider và server website;
5. Chỉ gửi token, mã sự kiện và mã phản hồi, **không gửi câu trả lời khảo sát,
   danh tính hay dữ liệu học viên** trong callback.

Người quản trị cần kiểm tra khả năng nhận/echo token và phát callback
thật của provider trước khi bật. Một URL biểu mẫu bất kỳ không đủ để
đáp ứng yêu cầu này. Website không thể tự xác nhận rằng người học
đã nộp khảo sát chỉ vì họ mở đường dẫn ngoài.

## Cấu hình
Tất cả đều tắt khi chưa có hạ tầng:
- \`TRAINING_REGISTRATION_ENABLED=false\`
- \`TRAINING_SURVEY_WEBHOOK_ENABLED=false\`
- \`TRAINING_SURVEY_LAUNCH_ENABLED=false\`
- \`TRAINING_SURVEY_WEBHOOK_SECRET=\` (tối thiểu 32 byte)
- \`TRAINING_SURVEY_PROVIDER_HOST=\` (host HTTPS chính xác được duyệt)
- \`TRAINING_SURVEY_1_URL=\` (form khảo sát phiên 1 đã được duyệt)
- \`TRAINING_SURVEY_9_URL=\` (form khảo sát phiên 9 đã được duyệt)
- \`TRAINING_PRIVACY_NOTICE_URL=\` (thông báo riêng tư chính thức HTTPS)
- \`APP_BASE_URL=\` (URL website chiến dịch thật HTTPS)

Phải chạy migrations 001–009 theo thứ tự. Không bật provider
trước khi xác minh domain, cấu hình CORS/HTTPS và phương án bảo vệ
dữ liệu cá nhân, đặc biệt với người chưa thành niên.
Không đưa URL khảo sát chưa xác minh vào kho mã.

## Chưa được nghiệm thu vận hành
- Chưa chọn, kết nối hay thử provider khảo sát thực tế.
- Chưa thử phản hồi HMAC thực tế, độ trễ callback, race conditions HTTP,
  cách provider chống nộp giả và xóa dữ liệu.
- Chưa kiểm thử E2E đăng ký → QR → nộp form → webhook → mở bài thi.
- Chưa có lịch dọn token hết hạn / thời hạn lưu khảo sát / rate limit
  ở tầng mạng / bảo vệ chống bot và kiểm tra hành vi đồng thời.
- Người học cũ bị mất cookie sau 30 ngày cần quy trình xác thực
  phục hồi phù hợp trước khi mở rộng phạm vi triển khai.
- CI xác nhận TypeScript, Next.js build và ràng buộc SQL bằng dữ liệu
  tổng hợp được ROLLBACK, **không xác minh provider đã hoạt động**.

Only survey confirmation rows attached to a consumed correlation handoff count toward training and exam eligibility. Any earlier uncorrelated confirmations are not automatically trusted.
