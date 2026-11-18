import Link from "next/link";
import { sections } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <strong>KHÔNG MỘT MÌNH 2026</strong>
          <p>Kết nối không tổn thương · Điện Biên</p>
          <p className="muted">Bản nền tảng đang phát triển. Chỉ công bố số liệu và tư liệu sau khi xác minh, được phê duyệt.</p>
        </div>
        <div><strong>Khám phá</strong><div className="footer-links">{sections.slice(0,7).map((s)=><Link href={s.path} key={s.path}>{s.short}</Link>)}</div></div>
        <div><strong>Hỗ trợ</strong><p>Trường hợp cần hỗ trợ về bảo vệ trẻ em, liên hệ Tổng đài 111.</p><a className="footer-call" href="tel:111">Gọi 111</a></div>
      </div>
    </footer>
  );
}
