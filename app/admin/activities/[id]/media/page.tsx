import Link from "next/link";
import { currentAdminSession, authConfigured, hasAdminPermission } from "@/lib/server/admin-security";
import { getDatabasePool } from "@/lib/server/db";
import ActivityMediaManager from "@/components/admin/ActivityMediaManager";

export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>};
export default async function ActivityMediaPage({params}:Props) {
  const {id}=await params;
  const admin=authConfigured()?await currentAdminSession():null;
  if(!admin)return <main className="container content-section">
    <h1>Liên kết tư liệu với hoạt động</h1>
    <div className="notice notice-warning">Cần đăng nhập quản trị.</div>
    <Link href="/admin">Đăng nhập →</Link>
  </main>;
  if(!/^[0-9a-f-]{36}$/i.test(id))return <main className="container content-section">
    <h1>Không tìm thấy hoạt động</h1></main>;
  try {
    const result=await getDatabasePool().query(
      "SELECT id,title,organization_id FROM activities WHERE id=$1",[id]
    );
    if(!result.rowCount)return <main className="container content-section"><h1>Không tìm thấy hoạt động</h1></main>;
    const act=result.rows[0];
    const canView=await hasAdminPermission(admin.id,"activities","view",act.organization_id,id);
    if(!canView)return <main className="container content-section"><h1>Không có quyền truy cập</h1></main>;
    const [canEdit,canApprove]=await Promise.all([
      hasAdminPermission(admin.id,"activities","edit",act.organization_id,id),
      hasAdminPermission(admin.id,"activities","approve",act.organization_id,id)
    ]);
    return <main>
      <section className="page-hero"><div className="container">
        <span className="eyebrow">QUẢN TRỊ HOẠT ĐỘNG</span>
        <h1>{act.title}</h1><p>Gắn tư liệu đã duyệt và kiểm soát quyền công bố.</p>
      </div></section>
      <ActivityMediaManager activityId={id} canEdit={canEdit} canApprove={canApprove}/>
      <div className="container"><Link href="/admin/activities">← Trở lại quản lý hoạt động</Link></div>
    </main>;
  } catch {
    return <main className="container content-section">
      <h1>Không thể tải tư liệu</h1>
      <div className="notice notice-warning">Dữ liệu nội bộ hiện không khả dụng.</div>
    </main>;
  }
}
