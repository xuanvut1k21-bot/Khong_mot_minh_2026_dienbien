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
}){
  const [enabled,setEnabled]=useState(false);
  const [pdfEnabled,setPdfEnabled]=useState(false);
  const [videoEnabled,setVideoEnabled]=useState(false);
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
      .then(data=>{if(!controller.signal.aborted){
        setEnabled(data.enabled===true);
        setPdfEnabled(data.pdfEnabled===true);
        setVideoEnabled(data.videoEnabled===true);
      }})
      .catch(()=>{if(!controller.signal.aborted)setEnabled(false);})
      .finally(()=>{if(!controller.signal.aborted)setReady(true);});
    return ()=>controller.abort();
  },[]);

  const allowedTypes=[
    "image/jpeg","image/png","image/webp",
    ...(pdfEnabled?["application/pdf"]:[]),
    ...(videoEnabled?["video/mp4"]:[])
  ];

  function acceptable(file:File):boolean{
    if(file.size<1)return false;
    if(file.type==="application/pdf")
      return pdfEnabled && category==="handbook" && file.size<=25*1024*1024;
    if(file.type==="video/mp4")
      return videoEnabled && category==="video" && file.size<=80*1024*1024;
    return ["image/jpeg","image/png","image/webp"].includes(file.type)
      && ["photo","infographic","brand","ambassador"].includes(category)
      && file.size<=10*1024*1024;
  }

  async function send(e:React.FormEvent){
    e.preventDefault();
    if(!file||!enabled||busy)return;
    if(!acceptable(file)){
      setStatus("Loại tệp, danh mục hoặc dung lượng không phù hợp.");
      return;
    }
    setBusy(true);setStatus("Đang tạo phiên tải lên vùng cách ly…");
    try{
      const initiate=await fetch("/api/v1/admin/media/uploads/initiate",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          title:title.trim(),description:description.trim(),organizationId:unitId,
          category,mime:file.type,size:file.size
        })
      });
      const signed:SignedPost&{error?:string}=await initiate.json();
      if(!initiate.ok)throw new Error(signed.error??"UPLOAD_INITIATION_FAILED");

      const payload=new FormData();
      for(const [name,value] of Object.entries(signed.fields))payload.append(name,value);
      payload.append("file",file);
      setStatus("Đang tải tệp vào kho riêng tư…");
      const uploaded=await fetch(signed.uploadUrl,{method:"POST",body:payload});
      if(!uploaded.ok)throw new Error("QUARANTINE_UPLOAD_FAILED");

      const complete=await fetch("/api/v1/admin/media/uploads/complete",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({sessionId:signed.sessionId})
      });
      const result=await complete.json().catch(()=>({}));
      if(!complete.ok)throw new Error(result.error??"UPLOAD_COMPLETION_FAILED");
      setTitle("");setDescription("");setFile(null);
      const input=document.getElementById("km-media-source-input") as HTMLInputElement|null;
      if(input)input.value="";
      await onUploaded();
      setStatus("Đã nhận tệp; chỉ có thể xem bản xử lý sau khi worker hoàn tất. Chưa công bố.");
    }catch(error){
      setStatus("Tải lên thất bại: "+
        (error instanceof Error?error.message:"UNKNOWN_ERROR")+
        ". Tệp chưa được công bố.");
    }finally{setBusy(false);}
  }

  if(!ready)return <p>Đang kiểm tra cấu hình tải tư liệu…</p>;
  if(!enabled)return <div className="notice">
    Chức năng tải tệp lên kho cách ly đang tắt. Phải cấu hình S3 riêng tư,
    bộ quét và worker xử lý trước khi bật.
  </div>;
  return <form className="demo-panel" onSubmit={e=>void send(e)}>
    <h3>Tải tư liệu lên vùng cách ly</h3>
    <p>Ảnh JPG/PNG/WebP được xử lý lại thành WebP. PDF và MP4 chỉ được
      tạo ảnh bìa tĩnh, không cho xem toàn văn hay phát video gốc trên website.
      Tất cả phải qua kiểm duyệt thủ công trước khi công bố.</p>
    <label className="field">Đơn vị
      <select required value={unitId} onChange={e=>setUnitId(e.target.value)}>
        <option value="">Chọn đơn vị</option>
        {units.map(u=><option key={u.id} value={u.id}>{u.public_name}</option>)}
      </select>
    </label>
    <label className="field">Tiêu đề
      <input required minLength={3} maxLength={300} value={title}
        onChange={e=>setTitle(e.target.value)}/>
    </label>
    <label className="field">Danh mục
      <select value={category} onChange={e=>{
        setCategory(e.target.value);setFile(null);
        const input=document.getElementById("km-media-source-input") as HTMLInputElement|null;
        if(input)input.value="";
      }}>
        <option value="photo">Ảnh hoạt động</option>
        <option value="infographic">Infographic</option>
        <option value="brand">Bộ nhận diện</option>
        <option value="ambassador">Đại sứ chiến dịch</option>
        {pdfEnabled&&<option value="handbook">PDF – xem trước ảnh bìa</option>}
        {videoEnabled&&<option value="video">MP4 – xem trước poster</option>}
      </select>
    </label>
    <label className="field">Mô tả (không nhập dữ liệu riêng tư)
      <textarea rows={2} maxLength={10000} value={description}
        onChange={e=>setDescription(e.target.value)}/>
    </label>
    <label className="field">Chọn tệp: ảnh ≤10 MB, PDF ≤25 MB, MP4 ≤80 MB
      <input id="km-media-source-input" type="file" required
        accept={allowedTypes.join(",")}
        onChange={e=>setFile(e.target.files?.[0]??null)}/>
    </label>
    <button className="button button-blue" type="submit"
      disabled={busy||!unitId||!file||!acceptable(file)}>
      {busy?"Đang xử lý…":"Tải vào vùng cách ly"}
    </button>
    {status&&<p role="status">{status}</p>}
  </form>;
}
