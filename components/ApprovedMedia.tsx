import { getApprovedMedia } from "@/lib/server/public-content";
import { isDatabaseConfigured } from "@/lib/server/db";

export async function ApprovedMedia() {
  if (!isDatabaseConfigured()) return <div className="empty-state">Chưa cấu hình cơ sở dữ liệu Thư viện. Có thể xem tài nguyên nguồn qua liên kết Drive chính thức bên dưới.</div>;
  try {
    const data = await getApprovedMedia();
    if (!data.items.length) return <div className="empty-state">Chưa có tài nguyên đã duyệt để công bố.</div>;
    return <div className="content-grid" aria-label="Tài nguyên truyền thông đã duyệt">
      {data.items.map(item => <article className="info-card" key={item.id}>
        <span className="section-kicker">{item.category}</span>
        <h3>{item.title}</h3>
        {item.description && <p>{item.description}</p>}
        {item.url.startsWith("/api/v1/media/") && <img src={item.url} alt={item.title}
          loading="lazy" style={{maxWidth:"100%",maxHeight:270,objectFit:"contain",borderRadius:8}}/>}
        {item.url.startsWith("/api/v1/media/") && ["handbook","video"].includes(item.category) &&
          <p>Chỉ hiển thị ảnh bìa đã được xử lý. Nội dung PDF/video đầy đủ chưa được phát qua website.</p>}
        <p><a href={item.url} target={item.url.startsWith("https://")?"_blank":undefined}
          rel="noopener noreferrer">{item.url.startsWith("/api/v1/media/") ?
            "Xem bản ảnh đã xử lý" : "Mở tài nguyên Drive đã duyệt"} ↗</a></p>
      </article>)}
    </div>;
  } catch {
    return <div className="notice notice-warning" role="status">Thư viện hiện không khả dụng.</div>;
  }
}
