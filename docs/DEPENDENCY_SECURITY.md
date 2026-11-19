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
- Hai giai đoạn deps/builder dùng Node 22 bookworm-slim với digest OCI
  `sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee`. Runtime sử dụng image tối giản Distroless
  nodejs22-debian13:nonroot với digest `sha256:39c66687298417dbf3ff2fb8b6012c20554494e16414ef7afd07b9abbb45b501`.
  Cả hai digest lấy bằng docker buildx imagetools inspect trên GitHub Actions.
  Digest cố định nội dung, KHÔNG tự cập nhật bản vá khi tag upstream đổi.
- GitHub Actions checkout v5 và setup-node v5 được pin đến full 40-hex
  commit SHA từ tag upstream đã đối chiếu. Trivy action v0.36.0 cũng
  được pin SHA của commit được tham chiếu bởi tag phát hành.
- CI chạy Trivy với image km2026-staging:ci sau build để kiểm tra CVE
  thuộc gói hệ điều hành (os). HIGH/CRITICAL làm CI lỗi, không bỏ qua
  bản vá chưa sẵn có; các finding phải được xử lý hoặc đánh giá công khai.
- Vẫn chưa có SBOM và chữ ký image, chưa quét mọi cấu hình container,
  không phải chứng nhận an toàn sản phẩm.
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

## Vá lỗi sharp 0.35.5
CI đã tìm thấy lỗ hổng severity high ở sharp 0.34.x/liên quan
libvips, libheif và librsvg. Nâng sharp lên 0.35.5 và cập nhật lockfile.
Vì cập nhật qua ranh giới minor có thay đổi API/hành vi, thêm smoke
test xử lý PNG thành WebP bằng các tùy chọn dùng trong worker.
Điều này không thay thế kiểm thử các tệp thực tế hay fuzz test.

## Quy tắc phát hành image
- Build digest: `sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee` (Node 22 bookworm slim).
- Runtime digest: `sha256:39c66687298417dbf3ff2fb8b6012c20554494e16414ef7afd07b9abbb45b501`
  (gcr.io/distroless/nodejs22-debian13:nonroot).
- Trivy thử nghiệm trên base Debian 12 trước đó phát hiện 37 HIGH/1 CRITICAL,
  gồm nhiều gói hệ điều hành không cần cho tiến trình Node. Probe riêng
  trên Distroless Debian 13 đã vượt qua quét OS HIGH/CRITICAL; kết quả
  cuối cùng phải kiểm tra trên toàn bộ image vừa build, không chỉ base.
- Khi có bản vá nền mới, kiểm tra registry và ghi lại cả hai digest
  theo quy trình, chạy npm audit + Trivy + smoke tests.
- Không nới ngưỡng Trivy, thêm .trivyignore hoặc dùng continue-on-error
  để che giấu findings chưa được xem xét/đồng ý bởi người chịu trách nhiệm.
- Trivy phụ thuộc tình trạng kết nối và dữ liệu CVE mới tại thời điểm CI;
  nếu không tải được cơ sở dữ liệu, job cũng không thể xác nhận an toàn.
