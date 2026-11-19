# SBOM CycloneDX và bằng chứng build – Giai đoạn tiếp theo

## Kết quả mã nguồn
- GitHub Actions build image `km2026-staging:ci` trên runner được cách ly,
  quét CVE của hệ điều hành ở mức HIGH/CRITICAL bằng Trivy và chỉ khi
  scan đạt mới tạo SBOM.
- Trivy xuất `artifacts/km2026-image.cdx.json` dạng **CycloneDX**,
  lập danh mục các gói phần mềm đã được phát hiện bên trong image
  hoàn chỉnh (OS + library), không chỉ một mẫu package.json.
- `node scripts/sbom-evidence.mjs ...` kiểm tra định dạng CycloneDX,
  danh sách component không rỗng, ghi nhận số lượng và SHA-256 của
  tệp SBOM, commit SHA của workflow, run ID và **Docker image ID cục bộ**.
- Hai tệp SBOM và `km2026-build-evidence.json` lưu dưới dạng
  GitHub Actions artifact, thời hạn lưu 14 ngày; **không push image**.
- `node --test tests/sbom-evidence.test.mjs` kiểm tra việc từ chối
  SBOM sai định dạng, trống component, commit không hợp lệ và image ID
  không hợp lệ.

## Quan trọng: checksum KHÔNG phải chữ ký số
- Tệp evidence có `signatureStatus: "not-signed"`.
- Image ID từ `docker image inspect` là ID image trên runner, **không
  phải digest manifest của image trên registry** vì image chưa push.
- SHA-256 phát hiện tệp bị thay đổi nhưng tự nó không chứng minh ai
  tạo/tuyên bố SBOM, không mang danh tính ký hoặc chuỗi tin cậy.
- Actions artifact là bằng chứng của một lần chạy CI; người kiểm toán
  cần đối chiếu run ID, commit, workflow YAML và quyền truy cập GitHub.
  Không nhận artifact của PR chưa review là bản phát hành chính thức.

## Khi nào mới ký và xác thực nguồn gốc thật?
Theo GitHub Documentation, GitHub Artifact Attestations cho
**repository private/internal** yêu cầu GitHub Enterprise Cloud.
Repository của dự án hiện là private; chưa xác nhận có điều kiện này,
do đó CI chưa cấu hình hoặc tuyên bố tạo attestation của GitHub.

Khi cơ quan có quyền quản trị xác nhận gói và chính sách cho phép:
1. Cấu hình môi trường phát hành được phê duyệt, branch protection và
   required reviewers, quyền phát hành tối thiểu.
2. Build từ commit đã review, xuất SBOM, ghi registry digest sau khi
   push image vào registry nội bộ được kiểm soát.
3. Sử dụng cơ chế chứng thực được phê duyệt (ví dụ GitHub
   `actions/attest` hoặc Sigstore/Cosign với KMS/OIDC được quản trị)
   cho đúng image digest và SBOM; không tự giữ khóa bí mật trong repo.
4. Kiểm tra chữ ký, định danh người ký, workflow, repository, commit
   và subject digest **trước khi deploy**, từ chối bản không hợp lệ.
5. Có kế hoạch quản lý khóa, thu hồi, bảo mật registry, rollback và
   kiểm tra thực tế ở staging. Không tự động ký trên PR chưa duyệt.

## Giới hạn của SBOM
SBOM chỉ bao gồm thành phần Trivy phát hiện từ image khi chạy CI;
không bảo đảm 100% file hoặc phụ thuộc bí mật đều được nhận diện.
SBOM không thay thế quét CVE, review mã nguồn, MFA, HTTPS, kiểm soát
truy cập, backup/restore hay kiểm toán quyền riêng tư trẻ em.

Dữ liệu test trong CI hoàn toàn tổng hợp. Không cung cấp dữ liệu thật
của học viên, thông tin đăng nhập hay khóa bí mật trong artifacts.


## Bước tiếp theo: cổng kiểm tra chữ ký (vẫn khóa)
Có workflow xác minh thủ công tại
.github/workflows/verify-staging-attestation.yml và script
scripts/verify-release-attestation.mjs. Không có quyền deploy,
chỉ chấp nhận GHCR manifest digest bất biến, SLSA provenance
và CycloneDX SBOM được GitHub CLI xác minh chữ ký thật.
**CI PR #17 chỉ cung cấp SBOM chưa ký**; quy trình vẫn bị khóa
cho tới khi có entitlement, image được phát hành và hai attestation.
Xem docs/RELEASE_ATTESTATION_GATE.md.
