# Kiểm tra chữ ký trước phát hành – khóa mặc định

**Trạng thái hiện tại: CHƯA CÓ IMAGE ĐƯỢC KÝ VÀ XÁC MINH.**
PR này chỉ tạo công cụ xác minh và workflow đọc/chặn. Không ký,
không build/phát hành image lên registry, không deploy và không bật
chức năng nhận thông tin học viên.

## Điều kiện nền tảng
Repo hiện được xác nhận là private. Tài liệu GitHub 2026 quy định
Artifact Attestations với private/internal repository yêu cầu
GitHub Enterprise Cloud. Chưa xác minh tài khoản này đủ điều kiện.
Công cụ GitHub đang được kết nối cũng không cung cấp quyền xem
trực tiếp cấu hình entitlement, tạo khóa hoặc ký image.

Bản SBOM của PR #17 được xuất nhưng có trường
signatureStatus=not-signed. Mã SHA-256 và GitHub Actions artifact
không phải chữ ký; **không được dùng chúng để mở khóa phát hành**.

## Cổng xác minh khi đã có bản phát hành thật
Workflow .github/workflows/verify-staging-attestation.yml:
- Chỉ chạy thủ công bằng workflow_dispatch tại refs/heads/main và
  qua GitHub Environment staging (cần người có quyền thiết lập reviewer).
- Chỉ nhận image có digest bất biến:
  ghcr.io/OWNER/REPO@sha256:<64 ký tự hex>. Không chấp nhận
  :latest, tag di động, image từ repository khác hoặc HTTP URL.
- Người vận hành nhập source_sha đầy đủ 40 ký tự hex.
- Dùng GH_TOKEN read-only và gh attestation verify trên image thật
  từ GHCR, buộc --repo, --signer-workflow,
  --source-ref refs/heads/main, --source-digest, OIDC issuer GitHub
  và --deny-self-hosted-runners.
- Gọi **hai lần xác minh độc lập** cho predicate
  https://slsa.dev/provenance/v1 và https://cyclonedx.org/bom,
  kiểm tra mỗi kết quả gắn cùng subject digest.
- Nếu không có image được ký, thiếu entitlement, registry thiếu quyền,
  metadata không khớp, một predicate thiếu hoặc công cụ xác minh lỗi:
  **exit code khác 0; RELEASE_BLOCKED**.
- Workflow có permissions attestations:read, packages:read,
  contents:read, không có quyền ghi/triển khai và không tạo máy chủ.
- Chỉ khi cả hai bước dùng **chữ ký thật** đều đạt, workflow mới
  ghi một kết quả VERIFIED vào GitHub Step Summary. Đây vẫn là
  bước nghiệm thu, KHÔNG TỰ ĐỘNG TRIỂN KHAI.

## Vì sao hiện tại vẫn bị khóa?
- CI hiện chỉ build image thử nghiệm ở local runner,
  không push GHCR, không có digest manifest phát hành.
- Chưa có workflow build/phát hành đã được ký với
  --signer-workflow repo/.github/workflows/ci.yml.
- Chưa có điều kiện sử dụng artifact attestations private được xác nhận
  và cũng chưa có GitHub Environment staging đang vận hành thật.
- Vì vậy **không nên chạy giả bằng tệp JSON, khóa tự tạo, checksum
  hoặc thay đổi cờ cổng xác minh**.

## Điều kiện để mở khóa trong tương lai
1. Người có quyền quản trị xác minh gói GitHub Enterprise Cloud hoặc
   phê duyệt một hệ thống ký độc lập có KMS/OIDC và root of trust được
   tổ chức kiểm soát. Không lưu private key trong source hoặc PR.
2. Rà soát/merge chuỗi PR phụ thuộc, thiết lập ruleset,
   required reviewers, và GitHub Environment staging có bảo vệ.
3. Xây pipeline **riêng được phê duyệt** để ký cả provenance và
   CycloneDX SBOM cho đúng digest của image đã push lên GHCR.
   Nếu pipeline ký không phải .github/workflows/ci.yml, người
   chịu trách nhiệm phải thẩm định và đổi pinned signerWorkflow
   trong release-attestation-policy.mjs, kèm kiểm thử.
4. Chỉ nhận image từ commit đã review trên main, xác thực độc lập
   chữ ký bằng GH CLI và lưu log kiểm tra không chứa secret.
5. Sau khi xác minh thành công, tiến hành các thử nghiệm khác trên
   staging: HTTPS, OIDC/MFA, backup/restore, WAF và quyền riêng tư.
   Không cho người thật sử dụng khi các điều kiện này chưa đạt.

## Giới hạn và cơ sở kỹ thuật
GitHub CLI xác minh tính toàn vẹn chữ ký, danh tính workflow
và nguồn gốc trước khi xuất JSON. script policy kiểm tra thêm tên
và digest image trong subject, không tin nội dung predicate để tự
xác nhận danh tính. Unit tests dùng JSON **giả lập chỉ để kiểm tra
parser**, không phải bằng chứng chữ ký.

Tài liệu:
- https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
- https://cli.github.com/manual/gh_attestation_verify

## Kiểm toán người phê duyệt và phiên bản GitHub CLI

Trước khi gọi lệnh xác minh chữ ký, workflow phải chạy
scripts/check-release-governance.mjs. Script chỉ đọc GitHub API,
mặc định RELEASE_BLOCKED nếu không đọc được cấu hình hoặc chưa đạt:
- GitHub Environment staging có ít nhất một required reviewer.
- prevent_self_review=true: người khởi chạy không được tự phê duyệt.
- Staging chỉ chấp nhận protected branches.
- Nhánh main có protection, quy tắc duyệt pull request (ít nhất
  một người phê duyệt) và required status checks.
- Phiên bản GitHub CLI tối thiểu 2.97.0.

GITHUB_TOKEN do GitHub Actions cấp có thể không đủ quyền đọc cấu hình
GitHub Environment/branch rules. Quản trị viên cần cấp GitHub App
installation token hoặc fine-grained token chỉ có quyền
Administration: read cho repository, cung cấp qua Environment secret
STAGING_GOVERNANCE_AUDIT_TOKEN. Không cấp quyền ghi, không lưu token
trong repo. Script không in dữ liệu reviewer hoặc token.

CVE-2026-64655 ảnh hưởng gh attestation verify dùng signer-workflow
trước 2.97.0, nên bắt buộc kiểm tra phiên bản thực tế trên runner
ngay trước khi xác minh, không dựa vào giả định phiên bản runner.
Nguồn: https://github.com/advisories/GHSA-mm27-mwq9-fr5g

Quy tắc required status checks cho biết kiểm tra CI bắt buộc trong
GitHub, không chứng minh nội dung toàn bộ pipeline đã được duyệt.
Nếu main chưa có governance phù hợp, workflow không được thành công
dù chữ ký có tồn tại. Chưa xác nhận Environment staging, audit token,
Enterprise entitlement hay image ký thật: trạng thái vẫn bị khóa.
