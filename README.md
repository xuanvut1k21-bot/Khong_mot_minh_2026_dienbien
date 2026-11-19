# KHÔNG MỘT MÌNH 2026 – KẾT NỐI KHÔNG TỔN THƯƠNG

Website chiến dịch tại Điện Biên, đang phát triển. **Không phải cổng tiếp nhận hỗ trợ hoặc thi chính thức** ở giai đoạn nền tảng.

## Chạy website

Yêu cầu Node.js 22 trở lên. Trong thư mục repository:

    npm install
    npm run dev

Mở http://localhost:3000. Kiểm tra bằng:

    npm run typecheck
    npm run build

## Phân hệ

- Trang chủ: /
- Lan tỏa chiến dịch: /lan-toa (Dance Challenge + Avatar Frame xử lý cục bộ)
- Cẩm nang: /cam-nang (hai nguồn PDF gốc)
- Hoạt động hưởng ứng: /hoat-dong (chưa có dữ liệu công bố)
- Đào tạo giảng viên nguồn: /dao-tao (chưa mở thi)
- Thư viện: /thu-vien (kho nguồn, chưa đồng bộ)
- Góc an toàn mạng: /an-toan-mang
- Quiz – Quà: /quiz (chỉ là lượt chơi thử cục bộ)
- Kết nối – Hỗ trợ: /ho-tro (đường dây 111; biểu mẫu chưa kích hoạt)
- Quản trị – Thống kê: /admin (chưa mở đăng nhập)

## Bộ nhận diện

Xanh dương #2B00D0, cam #FD0100, trắng ngà #E8F2F7. Không dùng vàng làm màu chủ đạo. Quiz dùng màu chữ đậm #192034 để bảo đảm tương phản.

## Trạng thái

Đây là giai đoạn 1: giao diện Next.js có các đường dẫn thật và chức năng cục bộ được ghi nhãn rõ ràng. Backend PostgreSQL, API có phân quyền, quét tệp, kiểm duyệt, ngân hàng câu hỏi và hệ thống hỗ trợ bảo mật sẽ triển khai sau, **không được ngầm coi các đoạn mã trong hội thoại là mã đã có trong repository**.

Tuyệt đối không nhập dữ liệu học sinh hoặc hồ sơ nhạy cảm vào bản thử. Không đưa thông tin bí mật vào repository hay commit.

## Cơ sở dữ liệu công khai

Đã có API chỉ đọc cho Hoạt động và Thư viện, chưa có API quản trị ghi dữ liệu. Hướng dẫn PostgreSQL: [docs/PUBLIC_CONTENT.md](docs/PUBLIC_CONTENT.md).
