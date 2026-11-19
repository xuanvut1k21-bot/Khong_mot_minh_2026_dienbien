# Kiểm toán chuỗi Pull Request #1–#19

**Ngày rà soát:** 19/11/2026. **Kết luận: NO-GO – CHƯA HỢP NHẤT.**

## Phạm vi và bằng chứng trực tiếp

Đã kiểm tra 19 PR từ repository private
`xuanvut1k21-bot/Khong_mot_minh_2026_dienbien`, đối chiếu GitHub
Pull Requests API, reviews API, Actions runs trên commit head và Git
compare cho từng cặp nhánh kề nhau.

| Hạng mục | Kết quả xác minh |
|---|---|
| Tổng PR trong phạm vi #1–#19 | 19 |
| PR còn mở, chưa merge | 19 |
| PR Draft | 19 |
| Reviewer được yêu cầu | 0 trên cả 19 |
| Review/approval đã gửi | 0 trên cả 19 |
| CI mới nhất đúng head SHA | 19/19 có lần chạy `Website checks` thành công |
| Kiểm tra quan hệ cha–con | 19/19 so sánh đúng, ahead > 0, behind = 0 |
| Main hiện tại | `88bf68edbdfc1e2df5299ec6bd2b22eaa2fd27bb` (initial commit) |
| Main được bảo vệ | **Không** (`protected: false`) |
| Required status checks trên main | **Chưa bật** (enforcement off, danh sách rỗng) |
| Trạng thái đủ điều kiện hợp nhất | **KHÔNG** |

GitHub REST endpoint chi tiết về branch protection trả 403 do giới hạn
quyền integration, nhưng endpoint đọc nhánh `/branches/main` trực tiếp
cho biết `protected=false` và không có required checks; không suy diễn
rằng có quy tắc quản trị bổ sung chưa xem được.

Các PR có trạng thái `mergeable=true` theo GitHub, nhưng đây chỉ là
kiểm tra khả năng hợp nhất mã, **không phải** phê duyệt bảo mật,
nghiệm thu nội dung hoặc cấp quyền đưa lên production.

## Thứ tự chuỗi phụ thuộc

`main → #1 → #2 → #3 → #4 → #5 → #6 → #7 → #8 → #9 → #10
→ #11 → #12 → #13 → #14 → #15 → #16 → #17 → #18 → #19`.

- #1–#5: nền tảng UI, dữ liệu, OIDC/RBAC, hoạt động và thư viện.
- #6–#7: tải media cách ly, quét ảnh, preview PDF/video.
- #8–#12: đào tạo 9 phiên, 90 câu hỏi, khảo sát có xác minh,
  kiểm thử hành trình và kiểm soát dữ liệu.
- #13–#16: staging preflight, Docker, npm lockfile, Trivy/CVE.
- #17–#19: SBOM, cổng xác minh chứng thực và quản trị phát hành.

Mỗi nhánh head là descendant trực tiếp của head nhánh trước, đúng
thứ tự. Không có bằng chứng về xung đột Git trong so sánh kề nhau.
**Điều đó không loại trừ lỗi nghiệp vụ hoặc xung đột khi thay đổi target
branch, squash/rebase, hoặc thay đổi main sau này.**

## Việc phải hoàn thành trước khi hợp nhất

1. Thiết lập bảo vệ `main`: yêu cầu ít nhất một reviewer độc lập,
   required check `Website checks`, chặn force push và push trực tiếp,
   áp dụng cho cả người có quyền quản trị nếu chính sách cho phép.
   Việc tạo ruleset/protection cần người có thẩm quyền thao tác trong
   GitHub Settings, không được giả định đã bật.
2. Chỉ định người review độc lập có hiểu biết về bảo mật, quyền riêng
   tư, nội dung đào tạo và vận hành. **Không tự phê duyệt**; đóng băng
   phạm vi tính năng và ghi nhận kết quả review từng PR.
3. Đánh giá thủ công OIDC/MFA, RBAC, hoạt động/media, bảo vệ dữ liệu
   học viên (bao gồm người dưới 18 tuổi), hợp lệ của consent, cơ chế
   xóa dữ liệu, HTTP callback và chống bot. CI chỉ dùng dữ liệu tổng hợp,
   không kiểm chứng IdP/provider khảo sát, S3, ClamAV, ffmpeg thực tế.
4. Chạy dry-run migrations 001–010 trên PostgreSQL staging riêng với
   dữ liệu tổng hợp và kế hoạch backup/restore/rollback đã thử.
5. Xác minh nguồn gốc SBOM và chữ ký image thật, GitHub Environment
   staging/reviewers; hiện chưa có image được ký, chưa xác nhận
   entitlement GitHub Artifact Attestations cho repo private.
6. Sau khi có approval và gates đạt, lập kế hoạch merge **từng PR** theo
   thứ tự #1 → #19, cập nhật branch target và xác minh diff lại sau
   từng merge; không tự động squash/rebase cả chuỗi trước khi thẩm định.
   Chạy lại CI trên commit merge và dừng nếu có khác biệt. Không
   triển khai staging/production chỉ vì merge thành công.

## Tự động kiểm toán lại, không tác động đến mã nguồn

`node scripts/audit-pr-chain.mjs` dùng GitHub CLI và GH_TOKEN
**chỉ đọc**, so sánh số PR, trạng thái Draft, lineage, review mới nhất
trên head SHA, lần chạy `Website checks` mới nhất và tình trạng bảo
vệ `main`. Script trả mã lỗi và in **BLOCKED** khi thiếu một điều kiện.

Workflow thủ công `.github/workflows/pr-chain-audit.yml` yêu cầu input
`AUDIT_NO_MERGE`, chỉ hoạt động từ nhánh main (sau khi được code review
và hợp nhất). Nó lưu báo cáo JSON 14 ngày, không có quyền merge,
deploy, tạo GitHub Environment hay đọc dữ liệu học viên.

Lưu ý: một khi chuỗi bắt đầu được hợp nhất, các nhánh/target PR có thể
thay đổi; cần cập nhật/rebaseline quy tắc quan hệ cha–con trước khi
dùng báo cáo như quyết định cho bước merge tiếp theo.

**Kết luận:** hiện tại quyết định an toàn là giữ tất cả PR Draft,
không merge và chưa mở tính năng đăng ký/thi/khảo sát.
