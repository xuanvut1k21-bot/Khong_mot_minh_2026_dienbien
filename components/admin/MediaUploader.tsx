"use client";

import { useEffect, useState } from "react";

type Unit={id:string;public_name:string};
type SignedPost={
  sessionId:string;assetId:string;uploadUrl:string;
  fields:Record<string,string>;expiresInSeconds:number;
};

export default function MediaUploader({
  units,onUploaded
}:{
  units:Unit[];
  onUploaded:()=>Promise<void>;
}) {
  const [enabled,setEnabled]=useState(false);
  const [ready,setReady]=useState(false);
  const [unitId,setUnitId]=useState("");
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [category,setCategory]=useState("photo");
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");

  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/v1/admin/media/uploads/config",{
      credentials:"same-origin",cache:"no-store",signal:controller.signal
    }).then(r=>r.ok?r.json():Promise.reject())
      .then(data=>{if(!controller.signal.aborted)setEnabled(data.enabled===true);})
      .catch(()=>{if(!controller.signal.aborted)setEnabled(false);})
      .finally(()=>{if(!controller.signal.aborted)setReady(true);});
    return ()=>controller.abort();
  },[]);

  async function send(e:React.FormEvent) {
    e.preventDefault();
    if(!file || !enabled || busy)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type) ||
       file.size<1 || file.size>10*1024*1024) {
      setStatus("Chỉ hỗ trợ JPG, PNG, WebP không quá 10 MB.");
      return;
    }
    setBusy(true);setStatus("Đang tạo phiên tải ảnh…");
    try {
      const init=await fetch("/api/v1/admin/media/uploads/initiate",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          title:title.trim(),description:description.trim(),
          organizationId:unitId,category,mime:file.type,size:file.size
        })
      });
      const signed:SignedPost & {error?:string}=await init.json();
      if(!init.ok)throw new Error(signed.error??"INITIATE_FAILED");

      const payload=new FormData();
      for(const [key,value] of Object.entries(signed.fields))payload.append(key,value);
      payload.append("file",file);
      setStatus("Đang gửi ảnh vào vùng cách ly…");
      const uploaded=await fetch(signed.uploadUrl,{method:"POST",body:payload});
      if(!uploaded.ok)throw new Error("S3_UPLOAD_FAILED");

      setStatus("Đang xác nhận tệp đã tải lên…");
      const complete=await fetch("/api/v1/admin/media/uploads/complete",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({sessionId:signed.sessionId})
      });
      const result=await complete.json().catch(()=>({}));
      if(!complete.ok)throw new Error(result.error??"COMPLETE_FAILED");
      setTitle("");setDescription("");setFile(null);
      const input=document.getElementById("km-media-image-input") as HTMLInputElement|null;
      if(input)input.value="";
      await onUploaded();
      setStatus("Đã nhận ảnh. Worker sẽ kiểm tra trước khi cán bộ khác phê duyệt.");
    }catch(error) {
      setStatus("Không thể hoàn thành tải ảnh: "+
        (error instanceof Error?error.message:"UPLOAD_FAILED")+
        ". Không công bố tệp chưa hoàn tất.");
    }finally{setBusy(false);}
  }

  if(!ready)return <p>Đang kiểm tra cấu hình tải ảnh…</p>;
  if(!enabled)return <div className="notice">
    Chức năng tải ảnh riêng tư đang khóa vì chưa cấu hình vùng cách ly,
    bộ quét an toàn và kho bản xem trước. Vẫn có thể đăng ký nguồn Drive bên trên.
  </div>;
  return <form className="demo-panel" onSubmit={e=>void send(e)}>
    <h3>Tải ảnh an toàn (JPG, PNG, WebP)</h3>
    <p>Ảnh sẽ được đưa vào vùng cách ly, kiểm tra và tạo bản WebP không chứa
    metadata gốc. Không có hình ảnh nào tự động được công bố.</p>
    <label className="field">Đơn vị
      <select value={unitId} required onChange={e=>setUnitId(e.target.value)}>
        <option value="">Chọn đơn vị</option>
        {units.map(u=><option key={u.id} value={u.id}>{u.public_name}</option>)}
      </select>
    </label>
    <label className="field">Tiêu đề ảnh
      <input required minLength={3} maxLength={300} value={title}
        onChange={e=>setTitle(e.target.value)}/>
    </label>
    <label className="field">Danh mục
      <select value={category} onChange={e=>setCategory(e.target.value)}>
        <option value="photo">Ảnh hoạt động</option>
        <option value="infographic">Infographic</option>
        <option value="brand">Bộ nhận diện</option>
        <option value="ambassador">Đại sứ chiến dịch</option>
      </select>
    </label>
    <label className="field">Mô tả (không ghi dữ liệu riêng tư)
      <textarea rows={2} maxLength={10000} value={description}
        onChange={e=>setDescription(e.target.value)}/>
    </label>
    <label className="field">Chọn ảnh, tối đa 10 MB
      <input id="km-media-image-input" type="file" required
        accept="image/jpeg,image/png,image/webp"
        onChange={e=>setFile(e.target.files?.[0]??null)}/>
    </label>
    <button className="button button-blue" type="submit" disabled={busy||!unitId||!file}>
      {busy?"Đang xử lý…":"Tải ảnh vào vùng cách ly"}
    </button>
    {status && <p role="status">{status}</p>}
  </form>;
}
