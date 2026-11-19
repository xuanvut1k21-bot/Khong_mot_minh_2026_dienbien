"use client";
import { useState } from "react";
type Props={lesson:1|9;available:boolean};
export default function SurveyLaunch({lesson,available}:Props){
 const [url,setUrl]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 async function begin(){
   setBusy(true);setMessage("");setUrl(null);
   try{
     const response=await fetch("/api/v1/training/surveys/"+lesson+"/launch",{
       method:"POST",credentials:"same-origin",
       headers:{"Content-Type":"application/json"},body:"{}",
       cache:"no-store",referrerPolicy:"no-referrer"
     });
     const data=await response.json().catch(()=>({}));
     if(!response.ok){
       const errors:Record<string,string>={
         UNAUTHORIZED:"Bạn cần đăng ký và sử dụng thiết bị đã đăng ký trước khi mở khảo sát.",
         SURVEY_ALREADY_VERIFIED:"Khảo sát này đã được xác nhận hoàn thành.",
         SURVEY_LAUNCH_RATE_LIMITED:"Bạn đã yêu cầu quá nhiều lần. Vui lòng dùng lượt khảo sát hiện tại hoặc thử lại sau.",
         LESSON_NOT_PUBLISHED:"Học liệu chưa được công bố.",
         SURVEY_NOT_CONFIGURED:"Khảo sát chưa được kết nối chính thức."
       };
       throw new Error(errors[data.error]??"Không thể tạo lượt khảo sát.");
     }
     if(typeof data.url!=="string" || !data.url.startsWith("https://"))
       throw new Error("Liên kết khảo sát không hợp lệ.");
     setUrl(data.url);
     setMessage("Lượt khảo sát đã được tạo. Bạn cần nộp câu trả lời trên hệ thống khảo sát; mở liên kết không đồng nghĩa đã hoàn thành.");
   }catch(error){
     setMessage(error instanceof Error?error.message:"Không thể bắt đầu khảo sát.");
   }finally{setBusy(false);}
 }
 return <section className="demo-panel">
   <h2>Khảo sát sau phiên {lesson}</h2>
   <p>QR dẫn về trang này của chiến dịch, không chứa thông tin cá nhân.
      Lượt khảo sát chỉ được xác nhận sau khi đối tác xác minh bài nộp.</p>
   {available&&<img src={"/api/v1/training/surveys/"+lesson+"/qr"}
       alt={"Mã QR khảo sát sau phiên "+lesson}
       width={220} height={220}/>}
   {available?<button className="button button-blue" disabled={busy}
     onClick={()=>void begin()}>{busy?"Đang chuẩn bị…":"Mở khảo sát chính thức"}</button>
    :<div className="notice notice-warning">
      Khảo sát chưa được kích hoạt hoặc học liệu chưa được công bố.
     </div>}
   {url&&<p><a className="button button-outline" href={url} target="_blank"
     rel="noopener noreferrer" referrerPolicy="no-referrer">
     Sang trang khảo sát để nộp câu trả lời ↗
   </a></p>}
   {message&&<p role="status">{message}</p>}
   <p>Không gửi mã lượt khảo sát cho người khác.
      Nếu đã nộp, quay lại trang Đào tạo để kiểm tra trạng thái xác minh.</p>
 </section>;
}
