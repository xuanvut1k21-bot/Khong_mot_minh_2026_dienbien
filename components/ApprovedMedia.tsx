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
        <a href={item.url} target="_blank" rel="noopener noreferrer">Mở tài nguyên đã được duyệt ↗</a>
      </article>)}
    </div>;
  } catch {
    return <div className="notice notice-warning" role="status">Thư viện hiện không khả dụng.</div>;
  }
}
