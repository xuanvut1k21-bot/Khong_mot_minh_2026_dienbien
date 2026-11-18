# Upload ảnh an toàn – Giai đoạn 6

## Phạm vi đã lập trình
Chỉ xử lý **ảnh tĩnh JPG, PNG, WebP tối đa 10 MiB**. PDF, video, SVG, HEIC
và ảnh động chưa được hỗ trợ. Không tải ảnh trực tiếp lên máy chủ Next.js.

Luồng:
1. Admin có quyền media.create tạo một phiên có hạn 90 giây.
2. Browser gửi ảnh qua presigned S3 POST tới **bucket cách ly riêng tư**.
   Chính sách ràng buộc khóa ngẫu nhiên, MIME khai báo và kích thước tệp.
3. Admin báo hoàn thành; server HEAD kiểm tra Content-Length và Content-Type.
4. Sau khi quyền POST hết hạn (có thêm 10 giây đệm), worker chọn việc
   bằng khóa PostgreSQL SKIP LOCKED và lease 10 phút.
5. Worker tải ảnh xuống vùng tạm, kiểm tra kích thước, chữ ký tệp,
   chạy ClamAV, kiểm tra kích thước ảnh <=16 megapixels; từ chối ảnh động.
6. Worker dùng Sharp tạo **bản WebP tĩnh được tái mã hóa**, loại bỏ metadata
   gốc theo mặc định; lưu ở bucket processed riêng tư. Worker ghi SHA-256
   của ảnh gốc, trạng thái clean và preview_ready. Không tự công bố.
7. Admin có quyền media.view có thể xem bản xử lý qua API nội bộ.
   Người khác người nhập kiểm duyệt quyền sử dụng, riêng tư và nội dung
   rồi mới được phê duyệt.
8. Chỉ ảnh đã qua quét **và** phê duyệt mới trả từ URL nội bộ
   /api/v1/media/:id/content. API xét trạng thái DB ở mỗi yêu cầu; no-store.
9. Thu hồi trạng thái làm API chặn các yêu cầu xem mới. Các bản đã được tải
   xuống trước đó không thể thu hồi trên thiết bị người nhận.

## Cấu hình hạ tầng trước khi bật
- Mặc định: \`MEDIA_IMAGE_UPLOADS_ENABLED=false\`.
- Tạo hai S3 buckets RIÊNG BIỆT, **Block Public Access** cho cả hai,
  bật mã hóa server-side, tắt public ACL và thiết lập lifecycle dọn tệp
  vùng cách ly (ví dụ sau 48 giờ). Nếu cần tuân thủ chính sách lưu trữ
  riêng, xem xét vòng đời bản đã xử lý.
- \`MEDIA_QUARANTINE_BUCKET\`, \`MEDIA_PROCESSED_BUCKET\`, \`AWS_REGION\`
  phải có giá trị thực, tránh chứa secrets trong repository.
- Cấu hình CORS **chỉ cho origin HTTPS của website** trên quarantine bucket:
  cho phép phương thức POST, header cần thiết. Không mở quyền origin \`*\`
  trong vận hành thực tế.
- Role của ứng dụng Next.js: chỉ ký POST vào bucket cách ly và HEAD đối tượng,
  GET bản processed; không cho phép ghi nội dung processed.
- Role của worker riêng: GET và DELETE quarantine; PUT vào processed;
  không có quyền cấp tài khoản/duyệt nội dung.
- Worker chạy trong tiến trình/container cách ly tài nguyên CPU/RAM,
  quyền filesystem tối thiểu. Cài ClamAV và cập nhật cơ sở dữ liệu nhận diện,
  đặt giới hạn về tệp và đồng thời xử lý. Không được thay ClamAV bằng
  lệnh giả trả exit code 0.
- Khởi động worker có lịch bằng \`npm run media:scan-one\`.
  Mỗi lần chạy xử lý một tệp; bộ lập lịch/queue và giám sát cần cấu hình riêng.
- Yêu cầu Node 22+, PostgreSQL 16+, HTTPS, OIDC/MFA và quyền admin.
- Chạy migration 001→005 theo thứ tự trước khi bật. Không đưa dữ liệu riêng tư
  của trẻ em vào môi trường thử nghiệm.

## Điều cần kiểm thử trước khi vận hành
- Luồng S3 POST qua trình duyệt thực (đúng CORS/bucket chính sách), hết hạn,
  gửi sai Content-Type, dung lượng không khớp, gửi lại object đã ký.
- ClamAV vắng mặt hoặc dữ liệu quét lỗi phải **fail closed**.
  Kiểm tra JPEG/PNG/WebP hợp lệ, tệp giả chữ ký, ảnh vượt số pixel,
  ảnh động, ảnh chứa metadata riêng tư, ảnh hỏng, ảnh quá hạn.
- Ngắt worker, lease hết hạn, retry tối đa ba lần, dọn đối tượng dư.
- Kiểm tra hai cán bộ khác nhau và thu hồi quyền xem đã phát hành.
- Thử tải cao, quota theo đơn vị, rate limiting, quyền IAM, log và audit.
- Bài kiểm tra GitHub Actions hiện tại xác minh TypeScript, Next.js build
  và các ràng buộc PostgreSQL; **không gọi S3, ClamAV, Sharp với ảnh thật
  hoặc OIDC/MFA**, vì chưa có hạ tầng kết nối.

## Lưu ý bổ sung
- Nội dung nguồn Google Drive vẫn thuộc luồng kiểm duyệt thủ công.
- Không gọi bộ quét ảnh này cho PDF/video. Chúng sẽ có quy trình riêng
  gồm chuyển mã an toàn và xử lý rủi ro nhúng.
- Cần cấu hình cơ chế chống spam/rate limit ở cổng trước khi sử dụng rộng.
