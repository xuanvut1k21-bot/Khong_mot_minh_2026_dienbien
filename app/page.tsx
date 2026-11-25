import Link from "next/link";
import Image from "next/image";
import campaignHero from "./campaign-assets/hero.webp";
import campaignSlogan from "./campaign-assets/slogan.webp";
import campaignStudents from "./campaign-assets/students.webp";
export const dynamic = "force-dynamic";
import { sections, official } from "@/lib/site";
import { PublishedActivities } from "@/components/PublishedActivities";

export default function HomePage() {
  return (
    <main className="home-page">
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
          <span className="eyebrow">CHIẾN DỊCH TẠI TỈNH ĐIỆN BIÊN · 2026</span>
          <h1>KHÔNG MỘT MÌNH<br /><span>KẾT NỐI KHÔNG TỔN THƯƠNG</span></h1>
          <p>Nhận diện nguy cơ, trang bị kỹ năng và kết nối nguồn hỗ trợ đáng tin cậy để cùng bảo vệ trẻ em trên không gian mạng.</p>
          <div className="button-row">
            <Link className="button button-white" href="/lan-toa">Khám phá chiến dịch</Link>
            <Link className="button button-orange" href="/ho-tro">Tìm kênh hỗ trợ</Link>
          </div>
          </div>
          <div className="campaign-art">
            <Image src={campaignHero} alt="Học sinh bên ba phím 0, 1 và M của chiến dịch" priority unoptimized />
            <Image className="campaign-slogan" src={campaignSlogan} alt="Kết nối không tổn thương – Phòng chống xâm hại trực tuyến" unoptimized />
          </div>
        </div>
      </section>
      <section className="container main-section">
        <div className="section-heading"><div><span className="section-kicker">KHÁM PHÁ</span><h2>Đồng hành cùng chiến dịch</h2></div><p>9 phân hệ chuyên đề và không gian quản trị tách biệt.</p></div>
        <div className="card-grid">
          {sections.filter(s=>s.path!=="/admin").map((s) => (
            <Link className="feature-card" href={s.path} key={s.path}>
              <span className="feature-icon" aria-hidden="true">{s.icon}</span>
              <h3>{s.title}</h3><p>{s.description}</p><span className="card-link">Khám phá →</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="container main-section">
        <div className="section-heading"><div><span className="section-kicker">HOẠT ĐỘNG TẠI ĐIỆN BIÊN</span><h2>Tin và hoạt động hưởng ứng</h2></div><Link href="/hoat-dong">Xem các hoạt động →</Link></div>
        <PublishedActivities featured />
      </section>
      <section className="container main-section split-callout">
        <div><Image className="campaign-students" src={campaignStudents} alt="Ba bạn trẻ chụp ảnh cùng nhau" unoptimized /><span className="section-kicker">KỸ NĂNG AN TOÀN MẠNG</span><h2>Không một mình trước các nguy cơ trực tuyến</h2><p>Nhận diện các hình thức tiếp xúc, nội dung, hành vi, lừa đảo và giả mạo bằng AI.</p><Link className="button button-blue" href="/an-toan-mang">Góc an toàn mạng</Link></div>
        <div><span className="section-kicker">TƯ LIỆU CHIẾN DỊCH</span><h2>Thông tin từ nguồn chính thức</h2><p>Sử dụng Key Visual và tài liệu đã được cung cấp; không tự chỉnh sửa biểu trưng nhận diện.</p><a className="button button-outline" href={official.brand} target="_blank" rel="noreferrer">Xem Key Visual gốc ↗</a></div>
      </section>
      <section className="container main-section hotline-panel"><div><span className="section-kicker">KẾT NỐI HỖ TRỢ</span><h2>Tổng đài quốc gia bảo vệ trẻ em: 111</h2><p>Đường dây hỗ trợ miễn phí 24/7. Website không thay thế kênh khẩn cấp.</p></div><a className="button button-blue" href="tel:111">Gọi 111</a></section>
    </main>
  );
}
