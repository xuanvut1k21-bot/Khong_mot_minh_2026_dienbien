# Khóa chức năng – kế hoạch tích hợp kỹ thuật

Tất cả 10 phân hệ được giữ theo quyết định đã thống nhất. Bản nền tảng này triển khai UI thật nhưng không giả lập sự an toàn của server.

## Trang chủ
11 khối giao diện; nội dung ghim thủ công và nội dung mới **chỉ sau khi được phê duyệt**. Không có hoạt động giả.

## Lan tỏa
Dance Challenge gồm video được nhập và duyệt bởi quản trị, không có tải video công cộng. Avatar Frame: chọn ảnh và PNG chính thức trong máy, ghép và tải về tại trình duyệt, không gửi ảnh lên máy chủ.

## Cẩm nang
Hai PDF gốc + HTML theo chương và tìm kiếm toàn văn khi đã đối chiếu với bản chính thức.

## Hoạt động
Đơn vị gửi dữ liệu qua đầu mối; quản trị nhập; duyệt mới công bố; số người dự kiến khác kết quả xác minh.

## Đào tạo
9 phiên, khảo sát sau phiên 1 và 9, xác minh hoàn thành cả hai; final 20 câu ngẫu nhiên trên 90 câu đã duyệt, 15 phút, đạt 16/20, không giới hạn lần làm. Chúc mừng đúng câu đã chốt; không cấp chứng chỉ, không bảng xếp hạng.

## Thư viện
Nguồn Drive hoặc tải tệp vào kho cách ly; quét kiểm tra, đối chiếu quyền sử dụng và kiểm duyệt. Không tự động đồng bộ Drive.

## Góc an toàn mạng
5 loại nguy cơ; bài mới từ nguồn chính thức chỉ tạo bản nháp để duyệt; không có bình luận công cộng.

## Quiz – Quà
Mức Cơ bản/Cấp cao riêng; 15 câu/lượt, 15 giây/câu; đúng <=5s 3đ, <=10s 2đ, <=15s 1đ; sai/hết giờ 0đ. Bảng xếp hạng theo điểm tốt nhất mỗi người/mức, sau đó tổng thời gian, rồi thời gian nộp sớm hơn. Đáp án và đồng hồ phải ở máy chủ, cần chống lạm dụng. Bản hiện tại chỉ thử giao diện cục bộ, không lưu hoặc công bố điểm.

## Kết nối – Hỗ trợ
111; gửi ẩn danh và mã tra cứu bí mật sau khi hoàn thành nhân sự, bảo mật, quy trình chuyển tuyến. Không có upload tệp trong biểu mẫu. Người quản trị kỹ thuật không mặc nhiên được đọc hồ sơ hỗ trợ.

## Quản trị
Chỉ quản trị viên được chỉ định được tạo tài khoản. Phân quyền theo vai trò, hành động, phạm vi; MFA, nhật ký, báo cáo tổng hợp và quy trình công bố. Không đăng ký tài khoản quản trị công cộng.

## Thứ tự triển khai
1. CI, thiết kế hệ thống, dữ liệu và tài khoản.
2. RBAC + kiểm duyệt.
3. Trang chủ, Lan tỏa, Cẩm nang, Hoạt động, Thư viện, An toàn mạng.
4. Đào tạo 9 phiên, khảo sát xác minh và thi server-side.
5. Quiz và bảng xếp hạng server-side.
6. Hỗ trợ riêng tư chỉ mở sau khi có đầy đủ nhân sự.
7. Báo cáo, kiểm thử thâm nhập, sao lưu/khôi phục, triển khai.

## Chưa đủ đầu vào để bật chức năng
Ngân hàng 90 câu đào tạo, hai liên kết khảo sát và xác minh, ngân hàng Quiz chính thức (60 câu/mức theo thiết kế), thể lệ phần thưởng, nhân sự hỗ trợ, tên miền và lưu trữ. Tuyệt đối không tự tạo dữ liệu giả thành nội dung chính thức.
