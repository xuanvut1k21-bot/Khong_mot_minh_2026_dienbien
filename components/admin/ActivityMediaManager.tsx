"use client";
import { useCallback, useEffect, useState } from "react";

type LinkRow={
  id:string;mediaId:string;title:string;category:string;
  status:"pending"|"approved"|"hidden";mediaStatus:string;
  driveUrl:string|null;canApprove:boolean;
};
type Media={id:string;title:string;description:string;category:string;url:string};

async function fetchJson(url:string,options?:RequestInit) {
  const r=await fetch(url,{credentials:"same-origin",cache:"no-store",...options});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(typeof data.error==="string"?data.error:"REQUEST_FAILED");
  return data;
}

export default function ActivityMediaManager({
  activityId,canEdit,canApprove
}: {activityId:string;canEdit:boolean;canApprove:boolean}) {
  const [links,setLinks]=useState<LinkRow[]>([]);
  const [media,setMedia]=useState<Media[]>([]);
  const [mediaPage,setMediaPage]=useState(1);
  const [hasMore,setHasMore]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const loadLinks=useCallback(async(signal?:AbortSignal)=>{
    const data=await fetchJson("/api/v1/admin/activities/"+activityId+"/assets",{signal});
    if(!signal?.aborted)setLinks(data.items??[]);
  },[activityId]);
  const loadMedia=useCallback(async(signal?:AbortSignal)=>{
    const data=await fetchJson("/api/v1/media?page="+mediaPage,{signal});
    if(!signal?.aborted){setMedia(data.items??[]);setHasMore(Boolean(data.hasMore));}
  },[mediaPage]);

  useEffect(()=>{
    const ac=new AbortController();
    loadLinks(ac.signal).catch(()=>{if(!ac.signal.aborted)setError("Không đọc được tư liệu đã gắn.");});
    return ()=>ac.abort();
  },[loadLinks]);
  useEffect(()=>{
    const ac=new AbortController();
    loadMedia(ac.signal).catch(()=>{if(!ac.signal.aborted)setError("Không tải được Thư viện công khai.");});
    return ()=>ac.abort();
  },[loadMedia]);

  async function action(body:
    {action:"propose";mediaId:string} |
    {action:"approve"|"hide";linkId:string}
  ) {
    if(body.action==="hide"&&!window.confirm("Ẩn tư liệu khỏi hoạt động này?"))return;
    setBusy(true);setError("");setNotice("");
    try {
      await fetchJson("/api/v1/admin/activities/"+activityId+"/assets",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body)
      });
      setNotice(body.action==="propose"?"Đã gửi đề xuất gắn tư liệu. Chờ người khác duyệt.":
        body.action==="approve"?"Đã duyệt liên kết tư liệu.":"Đã ẩn tư liệu khỏi hoạt động.");
      await loadLinks();
    } catch(e){setError(e instanceof Error?e.message:"Thao tác thất bại.");}
    finally {setBusy(false);}
  }

  return <div className="container content-section">
    <div className="notice">
      Tư liệu chỉ xuất hiện công khai khi <strong>hoạt động đã công bố</strong>,
      tư liệu gốc còn được phê duyệt và liên kết đã qua kiểm duyệt riêng.
      Thu hồi tư liệu gốc sẽ ngừng hiển thị liên kết trên website.
    </div>
    {error&&<div className="notice notice-warning" role="alert">{error}</div>}
    {notice&&<div className="notice" role="status">{notice}</div>}
    <h2>Liên kết tư liệu của hoạt động</h2>
    {!links.length&&<div className="empty-state">Chưa đề xuất gắn tư liệu.</div>}
    <div className="content-grid">
      {links.map(link=><div className="info-card" key={link.id}>
        <h3>{link.title}</h3><p>Trạng thái liên kết: <strong>{link.status}</strong></p>
        <p>Trạng thái tư liệu gốc: {link.mediaStatus}</p>
        {link.driveUrl&&<a target="_blank" rel="noopener noreferrer" href={link.driveUrl}>Xem tư liệu nguồn ↗</a>}
        {canApprove&&link.canApprove&&link.status==="pending"&&
          <p><button className="button button-blue" disabled={busy}
            onClick={()=>void action({action:"approve",linkId:link.id})}>Duyệt gắn tư liệu</button></p>}
        {canApprove&&link.status==="approved"&&
          <p><button className="button button-outline" disabled={busy}
            onClick={()=>void action({action:"hide",linkId:link.id})}>Ẩn liên kết</button></p>}
      </div>)}
    </div>
    {canEdit&&<>
      <h2>Chọn từ Thư viện đã được phê duyệt</h2>
      {!media.length&&<div className="empty-state">Chưa có tư liệu được phép công bố.</div>}
      <div className="content-grid">
        {media.map(item=><div className="info-card" key={item.id}>
          <span className="section-kicker">{item.category}</span>
          <h3>{item.title}</h3><p>{item.description}</p>
          <p><a href={item.url} target="_blank" rel="noopener noreferrer">Xem nguồn Drive ↗</a></p>
          <button disabled={busy||links.some(l=>l.mediaId===item.id&&l.status!=="hidden")}
            className="button button-blue" onClick={()=>void action({action:"propose",mediaId:item.id})}>
            Đề xuất gắn vào hoạt động
          </button>
        </div>)}
      </div>
      <div className="button-row">
        <button className="button button-outline" disabled={busy||mediaPage<=1}
          onClick={()=>setMediaPage(n=>Math.max(1,n-1))}>Trang trước</button>
        <span>Trang {mediaPage}</span>
        <button className="button button-outline" disabled={busy||!hasMore}
          onClick={()=>setMediaPage(n=>n+1)}>Trang tiếp</button>
      </div>
    </>}
  </div>;
}
