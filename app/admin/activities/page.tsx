import { currentAdminSession, authConfigured } from "@/lib/server/admin-security";
import { getDatabasePool } from "@/lib/server/db";
import ActivityManager from "@/components/admin/ActivityManager";
import Link from "next/link";

export const dynamic="force-dynamic";

export default async function AdminActivitiesPage() {
  const actor=authConfigured() ? await currentAdminSession() : null;
  if (!actor) return <main className="container content-section">
    <h1>Quản lý hoạt động</h1>
    <div className="notice notice-warning">Bạn cần đăng nhập quản trị được cấp quyền.</div>
    <Link href="/admin">Đến trang đăng nhập →</Link>
  </main>;
  try {
    const check=await getDatabasePool().query(
      [
        "SELECT EXISTS(SELECT 1 FROM admin_role_assignments a",
        "JOIN admin_role_permissions p ON p.role_code=a.role_code",
        "WHERE a.user_id=$1 AND p.resource='activities' AND p.action='view') AS can_view"
      ].join(" "),[actor.id]
    );
    if (check.rows[0]?.can_view!==true) return <main className="container content-section">
      <h1>Không có quyền xem hoạt động</h1>
      <p>Tài khoản chưa được cấp quyền phù hợp.</p>
    </main>;
    return <main>
      <section className="page-hero"><div className="container">
        <span className="eyebrow">KHU VỰC QUẢN TRỊ · ĐIỆN BIÊN</span>
        <h1>Hoạt động hưởng ứng</h1>
        <p>Nhập – trình duyệt – phê duyệt – công bố – xác minh kết quả.</p>
      </div></section>
      <ActivityManager/>
    </main>;
  } catch {
    return <main className="container content-section"><h1>Không thể tải quản trị</h1>
      <div className="notice notice-warning">Dữ liệu nội bộ tạm thời không khả dụng.</div></main>;
  }
}
