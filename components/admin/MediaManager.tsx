"use client";
import { useCallback, useEffect, useState } from "react";
import MediaUploader from "@/components/admin/MediaUploader";

type Unit={id:string;public_name:string};
type MediaRow={
  id:string;title:string;description:string;category:string;
  organization:string;organizationId:string;driveUrl:string|null;
  status:"pending"|"approved"|"rejected"|"revoked";createdBySelf:boolean;
  rightsHolder:string|null;rightsBasis:string|null;rightsEvidenceRef:string|null;
  rejectionReason:string|null;canApprove:boolean;canRevoke:boolean;
  sourceType:"drive"|"upload";scanStatus:string;previewReady:boolean;previewUrl:string|null;
  previewType:"image"|"pdf_cover"|"video_poster"|null;
};
const categories:Record<string,string>={
  brand:"Bộ nhận diện",infographic:"Infographic",video:"Video",
  photo:"Ảnh",handbook:"Cẩm nang",ambassador:"Đại sứ"
};
async function jsonRequest(url:string,options?:RequestInit) {
  const r=await fetch(url,{cache:"no-store",credentials:"same-origin",...options});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(typeof data.error==="string"?data.error:"REQUEST_FAILED");
  return data;
}
function postJson(url:string,body:unknown) {
  return jsonRequest(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
}

export default function MediaManager() {
  const [units,setUnits]=useState<Unit[]>([]);
  const [items,setItems]=useState<MediaRow[]>([]);
  const [status,setStatus]=useState("pending");
  const [page,setPage]=useState(1);
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [category,setCategory]=useState("photo");
  const [organizationId,setOrganizationId]=useState("");
  const [driveUrl,setDriveUrl]=useState("");
  const [selected,setSelected]=useState<MediaRow|null>(null);
  const [rightsHolder,setRightsHolder]=useState("");
  const [rightsBasis,setRightsBasis]=useState("");
  const [rightsEvidenceRef,setRightsEvidenceRef]=useState("");
  const [rightsOk,setRightsOk]=useState(false);
  const [privacyOk,setPrivacyOk]=useState(false);
  const [safetyOk,setSafetyOk]=useState(false);
  const [fullSourceReviewed,setFullSourceReviewed]=useState(false);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const load=useCallback(async(signal?:AbortSignal)=>{
    const params=new URLSearchParams({status,page:String(page)});
    const data=await jsonRequest("/api/v1/admin/media?"+params.toString(),{signal});
    if(!signal?.aborted)setItems(data.items??[]);
  },[status,page]);

  useEffect(()=>{
    const ac=new AbortController();
    load(ac.signal).catch(()=>{if(!ac.signal.aborted)setError("Không thể tải danh sách tư liệu.");});
    return ()=>ac.abort();
  },[load]);

  useEffect(()=>{
    const ac=new AbortController();
    jsonRequest("/api/v1/admin/media/organizations",{signal:ac.signal})
      .then(data=>{if(!ac.signal.aborted)setUnits(data.items??[]);})
      .catch(()=>{if(!ac.signal.aborted)setError("Không tải được danh mục đơn vị.");});
    return ()=>ac.abort();
  },[]);

  async function create(event:React.FormEvent) {
    event.preventDefault();
    setBusy(true);setError("");setNotice("");
    try {
      await postJson("/api/v1/admin/media",{
        title:title.trim(),description:description.trim(),category,organizationId,
        driveUrl:driveUrl.trim()
      });
      setTitle("");setDescription("");setDriveUrl("");
      setStatus("pending");setPage(1);
      await load();
      setNotice("Đã đăng ký nguồn Drive. Tư liệu đang chờ cán bộ khác kiểm duyệt.");
    } catch(e) {setError(e instanceof Error?e.message:"Không đăng ký được tư liệu.");}
    finally {setBusy(false);}
  }

  async function review(action:"approve"|"reject"|"revoke") {
    if(!selected)return;
    if(action==="revoke"&&!window.confirm("Xác nhận thu hồi quyền hiển thị tài nguyên này?"))return;
    setBusy(true);setError("");setNotice("");
    try {
      const body=action==="approve"?
        {action,rightsHolder:rightsHolder.trim(),rightsBasis:rightsBasis.trim(),
          rightsEvidenceRef:rightsEvidenceRef.trim(),
          rightsConfirmed:rightsOk,privacyConfirmed:privacyOk,safetyConfirmed:safetyOk,
          fullSourceReviewed}
        :{action,reason:reason.trim()};
      await postJson("/api/v1/admin/media/"+selected.id+"/review",body);
      setSelected(null);setReason("");setRightsHolder("");setRightsBasis("");
      setRightsEvidenceRef("");setRightsOk(false);setPrivacyOk(false);setSafetyOk(false);
      setFullSourceReviewed(false);
      await load();
      setNotice(action==="approve"?"Đã phê duyệt tư liệu.":action==="reject"?
        "Đã từ chối tư liệu.":"Đã thu hồi quyền hiển thị trên website.");
    } catch(e){setError(e instanceof Error?e.message:"Kiểm duyệt thất bại.");}
    finally {setBusy(false);}
  }

  function choose(item:MediaRow) {
    setSelected(item);setError("");setNotice("");setReason("");
    setRightsHolder(item.rightsHolder??"");setRightsBasis(item.rightsBasis??"");
    setRightsEvidenceRef(item.rightsEvidenceRef??"");
    setRightsOk(false);setPrivacyOk(false);setSafetyOk(false);
    setFullSourceReviewed(false);
  }

  return <div className="container content-section">
    <h2>Đăng ký nguồn truyền thông</h2>
    <div className="notice">
      Chỉ nhập liên kết tệp <strong>Google Drive đã được cấp quyền sử dụng</strong>.
      Không tự đồng bộ thư mục và không tải tệp lên website. Người duyệt phải kiểm tra
      thủ công nội dung, quyền sử dụng, quyền riêng tư và khả năng chia sẻ công khai.
    </div>
    {error && <div className="notice notice-warning" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    {units.length>0 && <form className="demo-panel" onSubmit={e=>void create(e)}>
      <label className="field">Đơn vị
        <select required value={organizationId} onChange={e=>setOrganizationId(e.target.value)}>
          <option value="">Chọn đơn vị</option>
          {units.map(u=><option key={u.id} value={u.id}>{u.public_name}</option>)}
        </select>
      </label>
      <label className="field">Tiêu đề
        <input minLength={3} maxLength={300} required value={title}
          onChange={e=>setTitle(e.target.value)}/>
      </label>
      <label className="field">Danh mục
        <select value={category} onChange={e=>setCategory(e.target.value)}>
          {Object.entries(categories).map(([code,label])=><option key={code} value={code}>{label}</option>)}
        </select>
      </label>
      <label className="field">Liên kết tệp Drive (dạng /file/d/.../view)
        <input type="url" required maxLength={500} value={driveUrl}
          onChange={e=>setDriveUrl(e.target.value)}
          placeholder="https://drive.google.com/file/d/.../view"/>
      </label>
      <label className="field">Mô tả
        <textarea rows={3} maxLength={10000} value={description}
          onChange={e=>setDescription(e.target.value)}/>
      </label>
      <button className="button button-blue" disabled={busy||!organizationId} type="submit">
        Đăng ký và gửi kiểm duyệt
      </button>
    </form>}
    {!units.length && <div className="empty-state">Chưa được cấp quyền đăng ký tư liệu cho đơn vị nào.</div>}
    <section className="content-section"><h2>Tải tư liệu vào vùng cách ly</h2>
      <MediaUploader units={units} onUploaded={async()=>{
        setStatus("pending");setPage(1);await load();
      }}/>
    </section>
    <h2>Danh sách tư liệu</h2>
    <label className="field">Lọc trạng thái
      <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);setSelected(null);}}>
        <option value="all">Tất cả</option><option value="pending">Chờ duyệt</option>
        <option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option>
        <option value="revoked">Đã thu hồi</option>
      </select>
    </label>
    <div className="content-grid">
      {items.map(item=><article className="info-card" key={item.id}>
        <span className="section-kicker">{item.organization} · {categories[item.category]??item.category}</span>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <p><strong>Trạng thái:</strong> {item.status}</p>
        {item.sourceType==="upload"&&<p><strong>Kiểm tra ảnh:</strong> {item.scanStatus}
          {item.previewReady?" · Bản xem trước đã sẵn sàng":""}</p>}
        {item.driveUrl && <p><a href={item.driveUrl} target="_blank" rel="noopener noreferrer">Kiểm tra tệp nguồn Drive ↗</a></p>}
        {item.previewUrl && item.previewType!=="image" &&
          <p>Chỉ có ảnh bìa xem trước, chưa hỗ trợ đọc PDF hoặc phát video.</p>}
        {item.previewUrl&&<p><img src={item.previewUrl} alt={item.title} loading="lazy"
          style={{maxWidth:"100%",maxHeight:250,objectFit:"contain",borderRadius:8}}/></p>}
        {item.rejectionReason && <p><strong>Lý do từ chối:</strong> {item.rejectionReason}</p>}
        {((item.canApprove && item.status==="pending") ||
          (item.canRevoke && item.status==="approved")) &&
          <button className="button button-outline" disabled={busy} onClick={()=>choose(item)}>Mở hồ sơ kiểm duyệt</button>}
      </article>)}
    </div>
    {!items.length && <div className="empty-state">Không có tài nguyên phù hợp trong phạm vi quyền.</div>}
    {(items.length===20||page>1) && <div className="button-row">
      <button className="button button-outline" disabled={page<=1||busy}
        onClick={()=>setPage(p=>Math.max(1,p-1))}>Trang trước</button>
      <span>Trang {page}</span>
      <button className="button button-outline" disabled={items.length<20||busy}
        onClick={()=>setPage(p=>p+1)}>Trang tiếp</button>
    </div>}
    {selected && <section className="demo-panel" style={{marginTop:24}}>
      <h2>Kiểm duyệt: {selected.title}</h2>
      <p><strong>Đơn vị:</strong> {selected.organization}</p>
      {selected.driveUrl && <p><a href={selected.driveUrl} target="_blank" rel="noopener noreferrer">Mở tệp nguồn để kiểm tra ↗</a></p>}
      {selected.previewUrl && selected.previewType!=="image" &&
        <p>Đây chỉ là ảnh bìa đã xử lý, không phải nội dung PDF/video đầy đủ.
          Cần kiểm tra quyền và nội dung gốc qua quy trình nội bộ trước khi duyệt.</p>}
      {selected.previewUrl&&<p><img src={selected.previewUrl} alt={selected.title}
        style={{maxWidth:"100%",maxHeight:380,objectFit:"contain"}}/></p>}
      {selected.sourceType==="upload"&&selected.scanStatus!=="clean"&&
        <div className="notice notice-warning">Ảnh chưa vượt qua kiểm tra tự động;
          không thể phê duyệt công khai.</div>}
      {selected.status==="pending" && <>
        {selected.createdBySelf && <div className="notice notice-warning">
          Người nhập không được tự phê duyệt hoặc từ chối tư liệu.
        </div>}
        <label className="field">Đơn vị/chủ sở hữu quyền sử dụng
          <input value={rightsHolder} maxLength={300} onChange={e=>setRightsHolder(e.target.value)}/>
        </label>
        <label className="field">Căn cứ cho phép sử dụng và công bố
          <textarea rows={3} value={rightsBasis} maxLength={1500}
            onChange={e=>setRightsBasis(e.target.value)}/>
        </label>
        <label className="field">Mã tài liệu/chứng cứ quyền sử dụng (không ghi dữ liệu nhạy cảm)
          <input value={rightsEvidenceRef} maxLength={500}
            onChange={e=>setRightsEvidenceRef(e.target.value)}/>
        </label>
        <label className="field"><input type="checkbox" checked={rightsOk}
          onChange={e=>setRightsOk(e.target.checked)}/> Đã xác minh quyền sử dụng và công bố</label>
        <label className="field"><input type="checkbox" checked={privacyOk}
          onChange={e=>setPrivacyOk(e.target.checked)}/> Đã kiểm tra quyền riêng tư và dữ liệu cá nhân</label>
        <label className="field"><input type="checkbox" checked={safetyOk}
          onChange={e=>setSafetyOk(e.target.checked)}/> Đã xem và kiểm tra tính phù hợp của nội dung nguồn Drive</label>
        {selected.sourceType==="upload" && ["pdf_cover","video_poster"].includes(selected.previewType??"") &&
          <label className="field"><input type="checkbox" checked={fullSourceReviewed}
            onChange={e=>setFullSourceReviewed(e.target.checked)}/>
            Tôi đã kiểm tra toàn bộ tệp PDF/video gốc bằng môi trường an toàn riêng,
            không chỉ xem ảnh bìa.
          </label>}
        <button className="button button-blue" disabled={busy||selected.createdBySelf||
          (selected.sourceType==="upload" && ["pdf_cover","video_poster"].includes(selected.previewType??"")
           && !fullSourceReviewed)||
          (selected.sourceType==="upload"&&(!selected.previewReady||selected.scanStatus!=="clean"))||
          !rightsOk||!privacyOk||!safetyOk||
          rightsHolder.trim().length<2||rightsBasis.trim().length<10||
          rightsEvidenceRef.trim().length<3}
          onClick={()=>void review("approve")}>Phê duyệt công khai</button>
      </>}
      {(selected.status==="pending"||selected.status==="approved") && <>
        <label className="field">{selected.status==="pending"?"Lý do từ chối":"Lý do thu hồi"}
          <textarea rows={2} value={reason} maxLength={1000}
            onChange={e=>setReason(e.target.value)}/>
        </label>
        <button className="button button-outline" disabled={busy||reason.trim().length<8||
          (selected.status==="pending"&&selected.createdBySelf)}
          onClick={()=>void review(selected.status==="pending"?"reject":"revoke")}>
          {selected.status==="pending"?"Từ chối":"Thu hồi"}
        </button>
      </>}
      <button className="button button-outline" disabled={busy} onClick={()=>setSelected(null)}>Đóng hồ sơ</button>
    </section>}
  </div>;
}
