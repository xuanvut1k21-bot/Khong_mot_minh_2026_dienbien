import { getPublishedActivities } from "@/lib/server/public-content";
import { isDatabaseConfigured } from "@/lib/server/db";

export async function PublishedActivities({ featured = false }: { featured?: boolean }) {
  if (!isDatabaseConfigured()) return <div className="empty-state">Cơ sở dữ liệu nội dung chưa được cấu hình. Danh sách sẽ chỉ hiển thị hoạt động đã công bố khi có dữ liệu được duyệt.</div>;
  try {
    const data = await getPublishedActivities({ limit: featured ? 4 : 12 });
    if (data.items.length === 0) return <div className="empty-state">Chưa có hoạt động được công bố. Không hiển thị sự kiện và số liệu giả.</div>;
    return <div className="content-grid" aria-label="Hoạt động đã công bố">
      {data.items.map(item => <article className="info-card" key={item.id}>
        <span className="section-kicker">{item.organization}</span>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        {item.startsAt && <p>Ngày tổ chức/dự kiến: {new Date(item.startsAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>}
        {item.location && <p>Địa điểm: {item.location}</p>}
        {item.firstMediaUrl && <p><a href={item.firstMediaUrl} target="_blank" rel="noopener noreferrer">Xem tư liệu đã duyệt ↗</a></p>}
        {item.verifiedResult && <p><strong>Kết quả đã xác minh:</strong> {item.verifiedResult.sessionsCount} buổi, {item.verifiedResult.attendanceCount} lượt tham gia.</p>}
      </article>)}
    </div>;
  } catch {
    return <div className="notice notice-warning" role="status">Dữ liệu hoạt động hiện không khả dụng.</div>;
  }
}
