# Giai đoạn 4.1 – Nền tảng Đào tạo giảng viên nguồn

## Yêu cầu đã có mã
- 9 vị trí phiên học số 1–9, tất cả để DRAFT, không tự bịa tên hoặc nội dung.
- Mỗi phiên công bố chỉ khi có tiêu đề, URL Drive file hợp lệ và được admin
  phê duyệt. Chưa có giao diện quản trị nội dung học liệu.
- Đăng ký chỉ thu họ tên và trường/cơ sở giáo dục, cùng việc xác nhận đã đọc
  thông báo bảo vệ dữ liệu. Không thu ngày sinh, số điện thoại, email,
  địa chỉ hoặc dữ liệu nhận dạng khác.
- Phiên học viên lưu cookie HttpOnly/SameSite, token 256-bit; CSDL chỉ lưu SHA-256.
  Người dùng có thể xóa toàn bộ thông tin đăng ký và lượt thi qua API DELETE.
- Hai khảo sát sau phiên 1 và 9 bắt buộc có kết quả được đơn vị cung cấp
  khảo sát xác minh, truyền qua webhook với chữ ký HMAC SHA-256 và timestamp.
  Một lần mở đường dẫn hoặc quét QR KHÔNG được xem là hoàn thành.
- Chỉ cho bắt đầu bài thi khi có 9 học liệu đã công bố, cả hai xác nhận khảo sát
  và đúng 90 câu hỏi được phê duyệt. Chưa có câu hỏi chính thức nào trong CSDL.
- Máy chủ chọn 20 câu ngẫu nhiên, giữ snapshot đáp án trên máy chủ,
  không trả correct_index cho người học. Hạn 15 phút theo đồng hồ CSDL,
  điểm đạt 16/20 trở lên, không hạn chế số lần thử.
- Không có bảng xếp hạng hay chứng nhận; màn hình hoàn thành chỉ hiển thị:
  "Congratulations! Chúc mừng bạn đã hoàn thành chương trình đào tạo giảng viên Không Một Mình 2026"

## Khóa mặc định
Các biến trong .env.example:
- TRAINING_REGISTRATION_ENABLED=false
- TRAINING_EXAM_ENABLED=false
- TRAINING_PRIVACY_NOTICE_URL= (phải là HTTPS thật, nội dung được duyệt)
- TRAINING_SURVEY_WEBHOOK_ENABLED=false
- TRAINING_SURVEY_WEBHOOK_SECRET= (bí mật tối thiểu 32 byte)
Bật đăng ký/thi chỉ khi đã có môi trường HTTPS, PostgreSQL,
quy trình bảo vệ dữ liệu người học, giới hạn tần suất đăng ký và thi,
và người chịu trách nhiệm vận hành. Nếu có người tham gia là trẻ chưa thành niên,
cần có cơ sở pháp lý và cơ chế thông báo/đồng ý phù hợp trước khi thu họ tên, trường.

## Nội dung và khảo sát
Học liệu chỉ nhập từ các phiên/bài giảng chính thức đã được người có thẩm quyền
kiểm tra. Migration chỉ tạo 9 slot, chưa phát hành nội dung Drive.
Ngân hàng 90 câu phải được thẩm định và phê duyệt theo quy trình riêng;
không tạo câu hỏi ngẫu nhiên/giả thành dữ liệu chính thức.
Khảo sát cần tích hợp provider tin cậy:
- Provider tự xác minh response thực sự được nộp; gắn mã learnerReference
  với response theo hướng ít thu thập dữ liệu.
- Provider POST JSON tới /api/v1/training/survey-verified, gồm
  eventId, learnerId, lessonNumber (1|9), responseReference.
- Header x-km-timestamp = Unix seconds; x-km-signature = HMAC-SHA256 hex
  của chuỗi timestamp + "." + raw JSON body.
- Secret được cấp ngoài GitHub; chỉ bật webhook sau khi provider được xác minh
  và cơ chế chống giả mạo response hoạt động thực tế.
- Phản hồi trùng eventId được xử lý idempotent; responseReference không thể
  dùng để xác minh cho nhiều học viên cùng kỳ khảo sát.

## API
GET /api/v1/training/overview: trạng thái 9 phiên, quyền đăng ký và thi.
POST /api/v1/training/register: đăng ký, khi đã bật và có thông báo riêng tư.
GET/DELETE /api/v1/training/me: xem trạng thái hoặc xóa dữ liệu của bản thân.
POST /api/v1/training/survey-verified: callback HMAC từ provider đáng tin.
POST /api/v1/training/attempts: mở hoặc lấy lại lượt đang thi.
GET /api/v1/training/attempts/:id: xem câu hỏi đang thi, không chứa đáp án.
POST /api/v1/training/attempts/:id: nộp đáp án, chấm trên máy chủ.

## Chưa đạt điều kiện vận hành
- Chưa nhập học liệu từng phiên; chưa có 90 câu được phê duyệt.
- Chưa có QR và endpoint khảo sát provider đã thử nghiệm thực.
- Chưa có màn hình quản trị ngân hàng câu hỏi và quy trình hai người duyệt.
- Chưa kiểm thử đầu-cuối session/Cookie/Origin/CSRF, khảo sát ngoài,
  giới hạn tần suất, bảo mật cơ sở dữ liệu, lịch xóa dữ liệu người học và khôi phục.
- Cần bổ sung bảo vệ chống spam đăng ký và truy cập lặp lại trước khi bật.
- CI chỉ chạy TypeScript, Next.js build, unit tests và PostgreSQL constraints
  với dữ liệu tổng hợp được ROLLBACK, không chứng minh an toàn production.

## Ghi chú bảo vệ người học và ngân hàng câu hỏi
Người đã đăng ký vẫn có thể tự xóa dữ liệu khi khóa đăng ký tạm đóng,
nếu website và cơ sở dữ liệu còn hoạt động. Chỉ người khác người biên soạn
mới được đứng tên duyệt câu hỏi trong CSDL; cả 90 câu cần duyệt trước khi mở thi.
