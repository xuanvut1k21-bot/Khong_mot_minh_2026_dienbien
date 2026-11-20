import { currentAdminSession, authConfigured } from "@/lib/server/admin-security";
import { getDatabasePool } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const configured = authConfigured();
  const admin = configured ? await currentAdminSession() : null;
  const grants = admin ? await getDatabasePool().query(
    "SELECT role_code, scope_type FROM admin_role_assignments WHERE user_id=$1 ORDER BY role_code",
    [admin.id]
  ).then(r=>r.rows).catch(()=>[]) : [];

  return <main>
    <section className="page-hero">
      <div className="container">
        <span className="eyebrow">KHU VỰC NỘI BỘ · KHÔNG MỘT MÌNH 2026</span>
        <h1>Quản trị và thống kê</h1>
        <p>Chỉ cán bộ được cấp tài khoản và phân quyền mới truy cập chức năng quản trị.</p>
      </div>
    </section>
    <div className="container content-section">
      {!configured && <div className="notice notice-warning">
        Đăng nhập quản trị chưa được cấu hình. Chưa thể truy cập hồ sơ hoặc nhập dữ liệu.
      </div>}
      {configured && !admin && <div className="demo-panel">
        <h2>Đăng nhập dành cho cán bộ</h2>
        <p>Hệ thống xác thực danh tính qua Google. Chủ tài khoản cần bật Xác minh 2 bước trong tài khoản Google; ứng dụng không xác nhận MFA theo từng phiên.
        Tài khoản phải được người quản trị có thẩm quyền cấp trước khi đăng nhập.</p>
        <a className="button button-blue" href="/api/v1/admin/auth/login">Đăng nhập bảo mật</a>
      </div>}
      {admin && <div className="demo-panel">
        <h2>Đã xác thực</h2>
        <p>{admin.displayName ?? "Tài khoản quản trị đã được xác thực"}</p>
        <h3>Vai trò được cấp</h3>
        {grants.length === 0 ? <p>Chưa được cấp vai trò thao tác.</p> :
          <ul>{grants.map((g,i)=><li key={i}>{g.role_code} · {g.scope_type}</li>)}</ul>}
        <p><a className="button button-blue" href="/admin/activities">Quản lý hoạt động hưởng ứng →</a></p>
        <p><a className="button button-outline" href="/admin/media">Kiểm duyệt Thư viện truyền thông →</a></p>
        <div className="notice">
          Hoạt động hưởng ứng có giao diện nhập và duyệt theo quyền được cấp.
          Thư viện truyền thông đã có phần quản trị nguồn Drive có kiểm duyệt. Các chức năng còn lại chưa được kích hoạt.
        </div>
        <form method="post" action="/api/v1/admin/auth/logout">
          <button className="button button-outline" type="submit">Đăng xuất</button>
        </form>
      </div>}
    </div>
  </main>;
}
