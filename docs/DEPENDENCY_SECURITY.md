# Quản lý thư viện và an toàn chuỗi cung ứng

## Đã hoàn thiện trong mã nguồn
- package-lock.json (lockfileVersion 3) được tạo bằng npm trong GitHub
  Actions và đối chiếu danh sách dependency gốc với package.json.
- GitHub Actions và Dockerfile dùng npm ci: nếu thay package.json mà
  không đồng bộ lockfile, cài đặt sẽ thất bại thay vì tự sửa dependency.
- CI chặn khi npm audit --omit=dev --audit-level=high có cảnh báo mức cao
  hoặc nghiêm trọng cho dependency production. Không dùng --force hoặc
  ignore advisory để đạt màu xanh giả tạo.
- Dependabot theo dõi npm, GitHub Actions và Docker mỗi tuần, tạo PR để
  con người xem xét, không bật auto-merge.

## Đánh giá và giới hạn
- Audit npm dựa trên advisory cơ sở dữ liệu npm tại thời điểm chạy,
  không đảm bảo phát hiện toàn bộ lỗ hổng hoặc supply-chain compromise.
- Bản base image node:22-bookworm-slim chưa pin digest; cần kiểm tra và
  cố định digest trước production, đồng thời theo dõi bản vá bảo mật.
- GitHub Actions checkout@v5 và setup-node@v5 chưa pin commit SHA.
  Trước production nên dùng SHA đã kiểm chứng và cập nhật có review.
- Chưa triển khai quét CVE hệ điều hành/container bằng công cụ độc lập
  (như Trivy/Grype), SBOM và ký xác thực image.
- Lockfile khóa phiên bản npm, nhưng binary native như sharp và nội dung
  image OS có thể khác theo kiến trúc nền tảng. Build/triển khai cần chốt
  kiến trúc và lưu image digest để hỗ trợ rollback.
- Không tự merge PR Dependabot hoặc sửa major version mà chưa kiểm thử
  chức năng thư viện, đăng nhập, khảo sát và quản trị dữ liệu học viên.

## Quy trình duy trì
1. Khi thay dependencies, chạy npm install trên môi trường kiểm soát và
   commit đồng thời package.json cùng package-lock.json.
2. Xem diff lockfile (nguồn resolved, integrity, phiên bản), rà advisory.
3. Chạy npm ci, TypeScript, Next.js build, PostgreSQL, HTTP integration
   và smoke test container trước khi merge.
4. Chỉ triển khai từ commit và image digest đã được người có thẩm quyền
   xác nhận; lưu log kiểm tra và phương án rollback.
5. Không điền thông tin riêng tư hoặc secrets vào npmrc, package.json,
   GitHub PR hoặc image.
