# Giai đoạn 4.2 – Quản trị và thẩm định nội dung Đào tạo

## Nguồn và quy tắc
Chưa có học liệu của 9 phiên hoặc ngân hàng 90 câu hỏi được giao đầy đủ ở
bước này; vì vậy không tự soạn, đoán, trích xuất hoặc đưa dữ liệu giả vào
production. Người được ủy quyền sẽ nhập nội dung dựa trên tài liệu nguồn
được thẩm định và phép sử dụng hợp lệ.

- Chỉ tài khoản OIDC/MFA và **vai trò global rõ ràng** mới được sử dụng.
- \`training_editor\`: nhập/sửa bản nháp, gửi duyệt phiên học và câu hỏi.
- \`training_approver\`: trả lại, phê duyệt hoặc thu hồi/lưu trữ nội dung.
- Không có quyền tự động cho \`technical_admin\` hoặc cấp quyền theo đơn vị
  khác của website. Thẩm quyền kiểm tra tại server cho từng thao tác.
- Người đang biên soạn một phiên học hoặc câu hỏi không được duyệt chính nó.
- URL nguồn bắt buộc là tệp Drive dạng HTTPS \`/file/d/.../view\`,
  không nhận URL ngoài hoặc thư mục.
- Mọi thao tác có audit với actor, nội dung, trạng thái trước/sau, thời gian.

## Phiên học
\`draft → pending → published\`. Reviewer được trả \`pending → draft\`,
hoặc thu hồi \`published → draft\`. Không sửa nội dung khi đang chờ
duyệt hoặc đã công bố. Bản công khai chỉ đọc tài liệu đã published.
Hệ thống giữ nguyên 9 slot, không tạo phiên thứ 10.

## Câu hỏi
\`draft → pending → approved → archived\`. Reviewer có thể trả pending
về draft. Không sửa trực tiếp câu đã duyệt; khi cần đính chính, lưu trữ
câu cũ rồi biên soạn một câu thay thế. Nguồn tham khảo Drive là bắt buộc
trước khi duyệt. Không cho phép đồng thời duyệt vượt 90 câu (advisory lock
trong giao dịch). Nếu có ít hơn 90 câu đã duyệt, hệ thống không mở đề thi.
Đáp án chỉ được đọc tại API quản trị toàn chương trình, không hiển thị ở
API học viên.

## API
- GET /api/v1/admin/training/lessons: danh sách 9 phiên và quyền.
- POST /api/v1/admin/training/lessons/:number: save, submit, return, publish, withdraw.
- GET /api/v1/admin/training/questions?status=...&page=...: trang tối đa 20 câu,
  kèm số lượng theo trạng thái.
- POST /api/v1/admin/training/questions: tạo bản nháp.
- POST /api/v1/admin/training/questions/:id: save, submit, return, approve, archive.
- /admin/training: giao diện quản trị cả hai nhóm nội dung.

## Ràng buộc an toàn
- Quyền đọc toàn bộ câu hỏi kèm đáp án đúng chỉ cấp cho người được ủy quyền.
- Không cho phép public truy cập các API admin. Không xuất câu hỏi, tên
  học viên hay kết quả riêng tư ra trạng thái công khai.
- Quá trình xuất bản yêu cầu nhà quản trị kiểm tra toàn bộ nội dung,
  bản quyền và quyền chia sẻ trước khi xác nhận.
- Đăng ký học viên, survey webhook, bài thi chính thức vẫn tắt theo cấu hình
  cho đến khi có thông báo riêng tư, chống lạm dụng, nhà cung cấp khảo sát
  có xác minh, 9 học liệu và 90 câu đã phê duyệt.
- GitHub Actions kiểm tra TypeScript, build Next.js và ràng buộc SQL với
  dữ liệu tổng hợp ROLLBACK; chưa có E2E với IdP, provider khảo sát hoặc
  nội dung thật. Không mở production trước nghiệm thu.
