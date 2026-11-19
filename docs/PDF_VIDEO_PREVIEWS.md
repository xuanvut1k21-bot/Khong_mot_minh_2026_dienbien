# Giai đoạn 3.9 – Xem trước PDF và MP4 bằng ảnh bìa đã xử lý

## Giới hạn hiện tại
Bản này **không có trình đọc PDF nhiều trang hoặc trình phát MP4**.
Nó chỉ tạo **ảnh bìa WebP** từ trang 1 của PDF hoặc khung hình đầu của MP4
trong môi trường worker tách biệt. Tệp gốc không được phát hành cho client.
PDF dung lượng tối đa 25 MiB, tối đa 100 trang, không mật khẩu;
MP4 tối đa 80 MiB, tối đa 180 giây, 1920×1080, H.264 hoặc HEVC.
Các giới hạn chỉ dành cho phiên bản đầu và có thể điều chỉnh sau kiểm thử.

## Điều kiện vận hành
Cả hai công tắc sau đều **tắt theo mặc định**:
- MEDIA_PDF_PREVIEW_ENABLED=false
- MEDIA_VIDEO_POSTER_ENABLED=false
Phải cấu hình MEDIA_IMAGE_UPLOADS_ENABLED=true, cơ sở dữ liệu,
S3 riêng tư, IAM, CORS, HTTPS, IdP MFA và ClamAV cập nhật như bước #6.
Mỗi worker phải chạy **trong container riêng không có mạng**, không phải
bên trong tiến trình Next.js phục vụ người dùng.
Yêu cầu phần mềm trong container đã được cập nhật:
- clamscan (cơ sở dữ liệu nhận diện đang hoạt động)
- pdfinfo, pdftoppm từ Poppler
- ffprobe, ffmpeg
- Node.js 22+, Sharp và file-type

Trước khi bật, xác minh các phiên bản đã vá lỗi bảo mật, giới hạn
CPU/RAM/PID/thời gian CPU, dung lượng đĩa tạm, user không root,
quyền filesystem tối thiểu và outbound network bị chặn.
Không tự động cấp quyền công bố hoặc đưa bucket ra public.

## Quy trình
1. Cán bộ media.create nhập PDF hoặc MP4 (đúng danh mục) tại /admin/media.
2. Website cấp presigned POST đến quarantine với giới hạn dung lượng/loại.
3. Sau khi hoàn thành, ghi trạng thái uploaded và chờ chữ ký POST hết hạn.
4. Chạy npm run media:scan-preview để nhận tối đa một việc.
5. Worker tải xuống vùng tạm an toàn, kiểm tra SHA-256, kích thước,
   chữ ký tệp và quét ClamAV. Sau đó:
   - PDF: pdfinfo kiểm tra số trang và mã hóa; pdftoppm kết xuất trang 1.
   - MP4: ffprobe kiểm tra thời lượng/codec/kích thước;
     ffmpeg tạo một ảnh poster từ khung hình đầu.
6. Sharp tái mã hóa ảnh bìa thành WebP tĩnh, không phát tệp gốc.
7. Worker lưu WebP vào bucket processed riêng tư, đánh dấu clean/preview_ready,
   **không tự duyệt**. Cán bộ thứ hai phải kiểm tra nội dung gốc, quyền
   sử dụng và quyền riêng tư trước khi phê duyệt.
8. Người xem chỉ nhận ảnh bìa được phép qua /api/v1/media/:id/content.
   Thu hồi sẽ chặn yêu cầu mới.

**Lưu ý quan trọng:** Ảnh bìa không đủ cơ sở để xác nhận nội dung toàn bộ
PDF/video là phù hợp. Cán bộ kiểm duyệt phải kiểm tra đầy đủ tệp gốc bằng
quy trình an toàn riêng trước khi bấm phê duyệt. Nếu thiếu điều kiện này,
không được bật hai công tắc.

## Kiểm thử còn phải thực hiện
- PDF hợp lệ, không hợp lệ, tệp mã hóa, trên 100 trang, nhiều nội dung
  nhúng, giả định dạng và tệp có mã độc;
- MP4 H.264/HEVC, tệp khác codec, thời lượng sai, sai kích thước;
- Khả năng ClamAV/Poppler/FFmpeg bị lỗi, bị kill, timeout hay hết RAM;
- Object S3 thay đổi, phiên hết hạn, quét lặp, worker chết giữa lúc xử lý;
- Chặn mọi request đến bản gốc, kiểm soát quyền khi thay đổi trạng thái;
- CORS, bucket public access block, role IAM, MFA/OIDC, tải đồng thời,
  dọn tệp tạm, rate limiting, giới hạn số lần upload theo đơn vị;
- Bảo đảm trình duyệt chỉ hiển thị ảnh WebP, không chạy script từ tài liệu.

CI hiện tại xác nhận compile/build và ràng buộc PostgreSQL.
**Không phải kiểm thử end-to-end với PDF/MP4 hoặc ClamAV thật.**

## Hướng phát triển tiếp
Trình xem PDF đầy đủ nên dựng từng trang sang WebP với giới hạn số trang
và lưu ở vùng riêng, kiểm tra quyền tại mỗi request. Video nếu phát trực
tuyến nên chuyển mã và phục vụ qua luồng có phân quyền, giới hạn byte/range
và kiểm soát thu hồi, không đưa original S3 thành URL công khai.
