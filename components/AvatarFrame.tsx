"use client";

import { useEffect, useRef, useState } from "react";
import { official } from "@/lib/site";

const SIZE = 600;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (file.size > 15 * 1024 * 1024 || !file.type.startsWith("image/")) {
      reject(new Error("Ảnh phải nhỏ hơn 15 MB và thuộc định dạng hình ảnh."));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được ảnh.")); };
    image.src = url;
  });
}

export function AvatarFrame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{x:number;y:number}|null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement|null>(null);
  const [frame, setFrame] = useState<HTMLImageElement|null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({x:0,y:0});
  const [message,setMessage] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (photo) {
      const ratio = Math.max(SIZE/photo.width,SIZE/photo.height)*scale;
      const width = photo.width*ratio, height=photo.height*ratio;
      ctx.drawImage(photo,(SIZE-width)/2+offset.x,(SIZE-height)/2+offset.y,width,height);
    } else {
      ctx.fillStyle="#394567";
      ctx.textAlign="center";
      ctx.font="bold 20px Arial";
      ctx.fillText("Chọn ảnh cá nhân",SIZE/2,SIZE/2);
    }
    if (frame) ctx.drawImage(frame,0,0,SIZE,SIZE);
  },[photo,frame,scale,offset]);

  async function selectPhoto(file?:File) {
    if (!file) return;
    try {setPhoto(await loadImage(file)); setScale(1); setOffset({x:0,y:0}); setMessage("Đã mở ảnh trong trình duyệt.");}
    catch (error) {setMessage(error instanceof Error?error.message:"Không đọc được ảnh.");}
  }

  async function selectFrame(file?:File) {
    if (!file) return;
    if (file.type!=="image/png") {setMessage("Khung chính thức phải là tệp PNG.");return;}
    try {setFrame(await loadImage(file));setMessage("Đã tải khung PNG cục bộ.");}
    catch (error) {setMessage(error instanceof Error?error.message:"Không đọc được khung.");}
  }

  function exportImage(type:"image/png"|"image/jpeg") {
    if (!photo || !frame || !canvasRef.current) {setMessage("Chọn ảnh và khung PNG gốc trước khi lưu.");return;}
    const link=document.createElement("a");
    link.download="khong-mot-minh-2026-avatar."+(type==="image/png"?"png":"jpg");
    link.href=canvasRef.current.toDataURL(type,0.94);
    link.click();
    setMessage("Ảnh được tạo trong trình duyệt, không gửi lên máy chủ.");
  }

  return (
    <section className="content-section">
      <h2>Tạo Avatar Frame tại trình duyệt</h2>
      <p>Ảnh cá nhân được xử lý cục bộ. Website không tải ảnh của bạn lên máy chủ.</p>
      <div className="content-grid">
        <div className="info-card">
          <label className="field">1. Chọn ảnh cá nhân<input type="file" accept="image/*" onChange={e=>void selectPhoto(e.target.files?.[0])}/></label>
          <label className="field">2. Chọn khung PNG chính thức<input type="file" accept="image/png" onChange={e=>void selectFrame(e.target.files?.[0])}/></label>
          <p><a href={official.frame} target="_blank" rel="noreferrer">Mở khung chiến dịch gốc trên Drive ↗</a></p>
          <label className="field">3. Điều chỉnh độ phóng to: {Math.round(scale*100)}%<input type="range" min="100" max="300" value={scale*100} onChange={e=>setScale(Number(e.target.value)/100)}/></label>
          <p>Kéo trên ảnh xem trước để căn vị trí. Cần dùng khung PNG chính thức để xuất bản nhận diện.</p>
          <div className="button-row">
            <button className="button button-blue" onClick={()=>exportImage("image/png")}>Lưu PNG</button>
            <button className="button button-outline" onClick={()=>exportImage("image/jpeg")}>Lưu JPG</button>
            <button className="button button-outline" onClick={()=>{setScale(1);setOffset({x:0,y:0});}}>Căn giữa</button>
          </div>
          <p role="status">{message}</p>
        </div>
        <div className="info-card">
          <canvas
            ref={canvasRef}
            className="avatar-canvas"
            width={SIZE}
            height={SIZE}
            aria-label="Xem trước ảnh đại diện chiến dịch"
            onPointerDown={e=>{dragRef.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
            onPointerMove={e=>{
              if(!dragRef.current)return;
              const ratio=SIZE/e.currentTarget.getBoundingClientRect().width;
              const dx=(e.clientX-dragRef.current.x)*ratio;
              const dy=(e.clientY-dragRef.current.y)*ratio;
              dragRef.current={x:e.clientX,y:e.clientY};
              setOffset(prev=>({x:prev.x+dx,y:prev.y+dy}));
            }}
            onPointerUp={()=>{dragRef.current=null;}}
            onPointerCancel={()=>{dragRef.current=null;}}
          />
          <p className="muted">Ảnh được ghép trong thiết bị. Không đăng lên thư viện chiến dịch.</p>
        </div>
      </div>
    </section>
  );
}
