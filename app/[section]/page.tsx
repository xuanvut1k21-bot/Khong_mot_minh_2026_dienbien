import Link from "next/link";
import Image from "next/image";
import danceTutorial from "../campaign-assets/dance-tutorial.webp";
import danceSample from "../campaign-assets/dance-sample.webp";
import mediaCover from "../campaign-assets/handbook-media.webp";
import educationCover from "../campaign-assets/handbook-education.webp";
import students from "../campaign-assets/students.webp";
import slogan from "../campaign-assets/slogan.webp";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sections, official, risks } from "@/lib/site";
import { AvatarFrame } from "@/components/AvatarFrame";
import { QuizPractice } from "@/components/QuizPractice";
import { PublishedActivities } from "@/components/PublishedActivities";
import { ApprovedMedia } from "@/components/ApprovedMedia";
import { TrainingPortal } from "@/components/TrainingPortal";

export const dynamicParams = false;
export const dynamic = "force-dynamic";
export function generateStaticParams() {
  return sections.filter(s=>s.path!=="/admin").map(s=>({section:s.path.slice(1)}));
}
export async function generateMetadata({params}:{params:Promise<{section:string}>}):Promise<Metadata>{
  const {section}=await params;
  const item=sections.find(s=>s.path==="/"+section);
  return {title:item?.title ?? "Không tìm thấy"};
}

function External({href,children}:{href:string;children:React.ReactNode}) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>;
}

export default async function SectionPage({params}:{params:Promise<{section:string}>}) {
  const {section}=await params;
  const info=sections.find(s=>s.path==="/"+section);
  if(!info)notFound();
  const artwork = section === "lan-toa" ? students : section === "thu-vien" ? slogan : null;
  return <main>
    <section className="page-hero">
      <div className={artwork ? "container section-art-header" : "container"}>
        <div><span className="eyebrow">KHÔNG MỘT MÌNH 2026 · ĐIỆN BIÊN</span><h1>{info.title}</h1><p>{info.description}</p></div>
        {artwork && <Image className="section-art-image" src={artwork} alt={section === "lan-toa" ? "Ba bạn trẻ cùng chụp ảnh bằng điện thoại" : "Kết nối không tổn thương – Phòng chống xâm hại trực tuyến"} unoptimized />}
      </div>
    </section>
    <div className="container content-section content-width">
      {section==="lan-toa" && <>
        <div className="content-grid">
          <div className="info-card"><h2>Dance Challenge – Lướt Chạm</h2><p>Xem các video chính thức. Video do đơn vị gửi sẽ do quản trị viên kiểm duyệt trước khi công bố; website không nhận video tải lên từ công chúng.</p>
            <div className="dance-videos">
              {[
                {title: "Video hướng dẫn", image: danceTutorial, href: official.danceTutorial},
                {title: "Video mẫu", image: danceSample, href: official.danceSample}
              ].map(({title, image, href}) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer">
                  <Image src={image} alt="" unoptimized />
                  <span>{title} ↗</span>
                </a>
              ))}
            </div>
            <External href={official.themeSong}>Bài hát chủ đề</External>
          </div>
          <div className="info-card"><h2>Thư viện video đã duyệt</h2><div className="empty-state">Chưa có dữ liệu video do các đơn vị gửi đã được duyệt trong bản nền tảng.</div></div>
        </div>
        <AvatarFrame />
      </>}
      {section==="cam-nang" && (
        <div className="content-grid handbook-grid">
          {[
            {title: "Cẩm nang truyền thông", cover: mediaCover, href: official.mediaHandbook},
            {title: "Cẩm nang giáo dục", cover: educationCover, href: official.educationHandbook}
          ].map(({title, cover, href}) => (
            <a className="handbook-card" href={href} target="_blank" rel="noopener noreferrer" key={href}>
              <div className="handbook-cover"><Image src={cover} alt="" unoptimized /></div>
              <div className="handbook-details">
                <h2>{title}</h2>
                <span>Đọc bản PDF trên Google Drive ↗</span>
              </div>
            </a>
          ))}
        </div>
      )}
      {section==="hoat-dong" && <>
        <h2>Hoạt động hưởng ứng tại Điện Biên</h2>
        <PublishedActivities />
        <div className="notice">Chỉ hiển thị hoạt động đã công bố. Số liệu kết quả phải được xác minh trước khi hiển thị.</div>
      </>}
      {section==="dao-tao" && <TrainingPortal />}
      {section==="thu-vien" && <>
        <h2>Kho tài liệu truyền thông</h2>
        <div className="content-grid">{["Bộ nhận diện","Infographic và poster","Video truyền thông","Ảnh hoạt động","Cẩm nang và học liệu","Đại sứ chiến dịch"].map(t=><div className="info-card" key={t}><h3>{t}</h3><p>Tài nguyên sẽ được cán bộ lựa chọn, kiểm tra quyền sử dụng và phê duyệt trước khi phát hành.</p></div>)}</div>
        <ApprovedMedia />
        <p><External href="https://khongmotminh.vn/#tai-lieu">Tài liệu trên website chính thức của chiến dịch</External></p>
        <p><External href={official.mediaFolder}>Kho tư liệu nguồn của chiến dịch</External></p>
        <div className="notice">Liên kết kho nguồn có thể yêu cầu quyền Drive. Website không tự động sao chép hoặc đồng bộ tất cả tệp từ Drive.</div>
      </>}
      {section==="an-toan-mang" && <>
        <h2>Nhận diện 5 nhóm nguy cơ</h2><div className="content-grid">{risks.map(r=><div className="info-card" key={r.title}><h3>{r.title}</h3><p>{r.body}</p></div>)}</div>
        <h2>5 bước tìm sự an toàn</h2><div className="step-list">{["Dừng lại","Không lan truyền","Lưu thông tin tham chiếu an toàn","Báo cáo","Chia sẻ với người lớn tin cậy"].map(t=><span key={t}>{t}</span>)}</div>
        <div className="notice notice-warning">Không tải xuống, lưu hoặc chuyển tiếp hình ảnh xâm hại trẻ em. Hãy báo cáo cho cơ quan có thẩm quyền hoặc người lớn đáng tin cậy.</div>
      </>}
      {section==="quiz" && <QuizPractice />}
      {section==="ho-tro" && <>
        <div className="content-grid"><div className="info-card"><h2>Tổng đài quốc gia bảo vệ trẻ em</h2><p style={{fontSize:50,color:"#2B00D0",fontWeight:900,margin:"10px 0"}}>111</p><p>Miễn phí, tiếp nhận 24/7. Đối với tình huống cần trợ giúp ngay, sử dụng kênh chính thức.</p><div className="button-row"><a className="button button-blue" href="tel:111">Gọi 111</a><External href={official.hotline}>Trang thông tin tổng đài</External></div></div>
        <div className="info-card"><h2>Biểu mẫu hỗ trợ riêng tư</h2><div className="notice notice-warning">Chưa kích hoạt tiếp nhận tình huống thực tế. Cần có nhân sự phụ trách, quy trình bảo mật và điều phối hỗ trợ trước khi mở biểu mẫu ẩn danh.</div><button className="button button-blue" disabled>Gửi yêu cầu (chưa kích hoạt)</button></div></div>
      </>}
      {section==="admin" && <>
        <h2>Không gian quản trị nội bộ</h2>
        <div className="notice notice-warning"><strong>Chưa kích hoạt đăng nhập quản trị.</strong> Không có tài khoản mặc định, mật khẩu mẫu hoặc quyền truy cập dữ liệu riêng tư.</div>
        <div className="content-grid">{["Tài khoản và phân quyền","Duyệt nội dung","Quản lý hoạt động","Thư viện và tài nguyên","Đào tạo & Quiz","Báo cáo tổng hợp và nhật ký"].map(t=><div className="info-card" key={t}><h3>{t}</h3><p>Chức năng sẽ mở sau khi backend, cơ sở dữ liệu, MFA và phân quyền đã kiểm thử.</p></div>)}</div>
      </>}
      <p style={{marginTop:30}}><Link href="/">← Về Trang chủ</Link></p>
    </div>
  </main>;
}
