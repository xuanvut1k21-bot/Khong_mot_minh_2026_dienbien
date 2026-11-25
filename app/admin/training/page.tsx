import Link from "next/link";
import { currentAdminSession,authConfigured,hasAdminPermission } from "@/lib/server/admin-security";
import TrainingEditorial from "@/components/admin/TrainingEditorial";

export const dynamic="force-dynamic";

export default async function TrainingAdminPage(){
 const actor=authConfigured()?await currentAdminSession():null;
 if(!actor)return <main className="container content-section">
  <h1>Quản trị Đào tạo</h1>
  <div className="notice notice-warning">Yêu cầu đăng nhập quản trị có MFA.</div>
  <Link href="/admin">Đến khu vực đăng nhập</Link>
 </main>;
 try{
  const [lessons,questions]=await Promise.all([
   hasAdminPermission(actor.id,"training_lessons","view"),
   hasAdminPermission(actor.id,"training_questions","view")
  ]);
  // Both permissions needed for this combined page, never leak answer keys
  // if a user is allowed to see only published curriculum.
  if(!lessons||!questions)return <main className="container content-section">
   <h1>Không có quyền xem quản trị đào tạo</h1>
   <p>Đề nghị cán bộ phụ trách cấp vai trò đào tạo đúng phạm vi.</p>
  </main>;
  return <main>
   <section className="page-hero"><div className="container">
    <span className="eyebrow">QUẢN TRỊ · KHÔNG MỘT MÌNH 2026</span>
    <h1>Biên soạn và thẩm định Đào tạo</h1>
    <p>9 phiên học và ngân hàng câu hỏi 90 câu, có người duyệt độc lập.</p>
   </div></section>
   <TrainingEditorial/>
  </main>;
 }catch{
  return <main className="container content-section">
   <h1>Quản trị đào tạo không khả dụng</h1>
   <div className="notice notice-warning">Chưa thể tải dữ liệu quản trị.</div>
  </main>;
 }
}
