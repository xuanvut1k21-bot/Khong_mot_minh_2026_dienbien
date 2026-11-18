import Link from "next/link";
import { sections } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-main">
        <Link className="brand" href="/" aria-label="Trang chủ Không Một Mình 2026">
          <span className="brand-mark" aria-hidden="true">01M</span>
          <span><strong>KHÔNG MỘT MÌNH 2026</strong><small>KẾT NỐI KHÔNG TỔN THƯƠNG · ĐIỆN BIÊN</small></span>
        </Link>
        <a className="header-hotline" href="tel:111">Tổng đài bảo vệ trẻ em <strong>111</strong></a>
      </div>
      <nav className="site-nav" aria-label="Danh mục chính">
        <div className="container nav-scroll">
          <Link href="/">Trang chủ</Link>
          {sections.map((s) => <Link href={s.path} key={s.path}>{s.short}</Link>)}
        </div>
      </nav>
    </header>
  );
}
