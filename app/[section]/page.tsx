import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sections, official, risks } from "@/lib/site";
import { AvatarFrame } from "@/components/AvatarFrame";
import { QuizPractice } from "@/components/QuizPractice";

export const dynamicParams = false;
export function generateStaticParams() {
  return sections.map(s=>({section:s.path.slice(1)}));
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
  return <main>
    <section className="page-hero"><div className="container"><span className="eyebrow">KHÔNG MỘT MÌNH 2026 · ĐIỆN BIÊN</span><h1>{info.title}</h1><p>{info.description}</p></div></section>
    <div className="container content-section content-width">
      {section==="lan-toa" && <>
        <div className="content-grid">
          <div className="info-card"><h2>Dance Challenge – Lướt Chạm</h2><p>Xem các video chính thức. Video do đơn vị gửi sẽ do quản trị viên kiểm duyệt trước khi công bố; website không nhận video tải lên từ công chúng.</p>
            <ul className="resource-list"><li><External href={official.danceTutorial}>Video hướng dẫn</External></li><li><External href={official.danceSample}>Video mẫu</External></li><li><External href={official.themeSong}>Bài hát chủ đề</External></li></ul>
          </div>
          <div className="info-card"><h2>Thư viện video đã duyệt</h2><div className="empty-state">Chưa có dữ liệu video do các đơn vị gửi đã được duyệt trong bản nền tảng.</div></div>
        </div>
        <AvatarFrame />
      </>}
      {section==="cam-nang" && <>
        <div className="content-grid"><div className="info-card"><h2>Cẩm nang truyền thông</h2><p>Tài liệu chính thức gồm 5 phần.</p><External href={official.mediaHandbook}>Đọc bản PDF gốc</External><ol>{Array.from({length:5},(_,i)=><li key={i}>Phần {i+1} – Nội dung theo tài liệu gốc</li>)}</ol></div>
        <div className="info-card"><h2>Cẩm nang giáo dục</h2><p>Tài liệu chính thức gồm 6 phần.</p><External href={official.educationHandbook}>Đọc bản PDF gốc</External><ol>{Array.from({length:6},(_,i)=><li key={i}>Phần {i+1} – Nội dung theo tài liệu gốc</li>)}</ol></div></div>
        <div className="notice">Chế độ HTML đọc theo chương và tìm kiếm toàn văn chưa mở vì cần đối chiếu toàn bộ nội dung với PDF gốc, tránh công bố sai tài liệu.</div>
      </>}
      {section==="hoat-dong" && <>
        <h2>Hoạt động hưởng ứng tại Điện Biên</h2>
        <div className="empty-state">Chưa có sự kiện được nhập và phê duyệt trong cơ sở dữ liệu. Trang không tạo lịch, đơn vị hoặc số lượt tham dự giả. Quy trình công bố: cán bộ nhập → gửi duyệt → phê duyệt → công bố → xác minh kết quả.</div>
      </>}
      {section==="dao-tao" && <>
        <h2>Chương trình đào tạo giảng viên nguồn</h2>
        <div className="content-grid"><div className="info-card"><h3>9 phiên học</h3><ol>{Array.from({length:9},(_,i)=><li key={i}>Phiên học {i+1} – chờ tích hợp học liệu đã duyệt</li>)}</ol></div>
        <div className="info-card"><h3>Hai khảo sát bắt buộc</h3><p>Khảo sát sau phiên 1 và phiên 9 phải được xác minh hoàn thành, không chỉ ghi nhận người dùng bấm liên kết.</p><h3>Bài kiểm tra cuối khóa</h3><p>20 câu ngẫu nhiên từ 90 câu đã được duyệt · 15 phút · đạt tối thiểu 16/20 · không giới hạn số lần làm.</p><button className="button button-blue" disabled>Chưa mở bài kiểm tra</button></div></div>
        <div className="notice notice-warning">Chưa có ngân hàng 90 câu đã thẩm định và xác minh hai khảo sát, vì vậy chưa cho phép tham gia thi chính thức. Không cấp chứng chỉ hoặc xếp hạng.</div>
      </>}
      {section==="thu-vien" && <>
        <h2>Kho tài liệu truyền thông</h2>
        <div className="content-grid">{["Bộ nhận diện","Infographic và poster","Video truyền thông","Ảnh hoạt động","Cẩm nang và học liệu","Đại sứ chiến dịch"].map(t=><div className="info-card" key={t}><h3>{t}</h3><p>Tài nguyên sẽ được cán bộ lựa chọn, kiểm tra quyền sử dụng và phê duyệt trước khi phát hành.</p></div>)}</div>
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
