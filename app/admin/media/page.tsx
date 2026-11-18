import Link from "next/link";
import MediaManager from "@/components/admin/MediaManager";
import { currentAdminSession, authConfigured } from "@/lib/server/admin-security";
import { getDatabasePool } from "@/lib/server/db";

export const dynamic="force-dynamic";

export default async function AdminMediaPage() {
  const actor=authConfigured()?await currentAdminSession():null;
  if (!actor) return <main className="container content-section">
    <h1>Quản trị Thư viện truyền thông</h1>
    <div className="notice notice-warning">Cần đăng nhập quản trị được cấp quyền.</div>
    <Link href="/admin">Đến trang quản trị →</Link>
  </main>;
  try {
    const r=await getDatabasePool().query(
      [
        "SELECT EXISTS (SELECT 1 FROM admin_role_assignments a",
        "JOIN admin_role_permissions p ON p.role_code=a.role_code",
        "WHERE a.user_id=$1 AND p.resource='media' AND p.action='view') AS can_view"
      ].join(" "),[actor.id]
    );
    if (!r.rows[0]?.can_view) return <main className="container content-section">
      <h1>Chưa được cấp quyền xem Thư viện</h1></main>;
    return <main>
      <section className="page-hero"><div className="container">
        <span className="eyebrow">QUẢN TRỊ · KHÔNG MỘT MÌNH 2026</span>
        <h1>Thư viện truyền thông</h1>
        <p>Đăng ký nguồn Drive, kiểm duyệt, phê duyệt và thu hồi.</p>
      </div></section>
      <MediaManager/>
    </main>;
  } catch {
    return <main className="container content-section">
      <h1>Thư viện không khả dụng</h1>
      <div className="notice notice-warning">Không thể đọc dữ liệu quản trị.</div>
    </main>;
  }
}
