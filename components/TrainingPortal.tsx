"use client";
import { useCallback, useEffect, useState } from "react";

type Lesson={number:number;title:string|null;url:string|null;published:boolean};
type Overview={
  lessons:Lesson[];registrationOpen:boolean;examOpen:boolean;
  privacyNoticeUrl:string|null;bankReady:boolean;
  surveysVerified:number[];learnerReference:string|null;
};
type Question={position:number;text:string;options:string[]};
type Paper={attemptId:string;expiresAt:string;questions:Question[]};
const DEFAULT_LESSONS:Array<Lesson>=Array.from({length:9},(_,i)=>({
  number:i+1,title:null,url:null,published:false
}));
async function json(url:string,options?:RequestInit):Promise<any>{
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(
    typeof data.error==="string"?data.error:"REQUEST_FAILED"
  );
  return data;
}
function send(path:string,value:unknown){
  return json(path,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(value)});
}

export function TrainingPortal(){
  const [overview,setOverview]=useState<Overview|null>(null);
  const [name,setName]=useState("");
  const [school,setSchool]=useState("");
  const [ack,setAck]=useState(false);
  const [paper,setPaper]=useState<Paper|null>(null);
  const [answers,setAnswers]=useState<Record<number,number>>({});
  const [remaining,setRemaining]=useState(900);
  const [result,setResult]=useState<{passed:boolean;message:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [note,setNote]=useState("");

  const reload=useCallback(async()=>{
    const data:Overview=await json("/api/v1/training/overview");
    setOverview(data);
  },[]);

  useEffect(()=>{
    let mounted=true;
    json("/api/v1/training/overview").then(data=>{
      if(mounted)setOverview(data);
    }).catch(()=>{
      if(mounted)setError("Dữ liệu đào tạo tạm thời không khả dụng.");
    });
    return ()=>{mounted=false;};
  },[]);
  useEffect(()=>{
    if(!paper)return;
    const clock=()=>{
      setRemaining(Math.max(0,Math.ceil(
        (new Date(paper.expiresAt).getTime()-Date.now())/1000
      )));
    };
    clock();const id=setInterval(clock,1000);
    return ()=>clearInterval(id);
  },[paper]);

  async function register(event:React.FormEvent){
    event.preventDefault();setBusy(true);setError("");setNote("");
    try{
      await send("/api/v1/training/register",{
        fullName:name.trim(),schoolName:school.trim(),privacyAcknowledged:ack
      });
      setName("");setSchool("");setAck(false);
      setNote("Đăng ký thành công. Chờ các học liệu và khảo sát chính thức.");
      await reload();
    }catch(e){setError(e instanceof Error?e.message:"Đăng ký không thành công.");}
    finally{setBusy(false);}
  }
  async function start(){
    setBusy(true);setError("");setNote("");
    try{
      const next:Paper=await send("/api/v1/training/attempts",{});
      setPaper(next);setAnswers({});setResult(null);
    }catch(e){setError(e instanceof Error?e.message:"Bài thi chưa thể mở.");}
    finally{setBusy(false);}
  }
  async function submit(){
    if(!paper)return;
    if(!window.confirm("Nộp bài kiểm tra cuối khóa?"))return;
    setBusy(true);setError("");setNote("");
    try{
      const submitted=Object.entries(answers).map(([position,choiceIndex])=>({
        position:Number(position),choiceIndex
      }));
      const done:{passed:boolean;message:string}=await send(
        "/api/v1/training/attempts/"+paper.attemptId,{answers:submitted}
      );
      setPaper(null);setAnswers({});setResult(done);
    }catch(e){
      setError(e instanceof Error?e.message:"Chưa nộp được bài.");
      if(e instanceof Error&&e.message==="EXPIRED"){
        setPaper(null);setNote("Hết 15 phút. Bạn có thể bắt đầu lượt mới.");
      }
    }finally{setBusy(false);}
  }
  async function withdraw(){
    if(!window.confirm("Xóa thông tin đăng ký, các xác nhận khảo sát và lượt thi của bạn?"))return;
    setBusy(true);setError("");
    try{
      await json("/api/v1/training/me",{method:"DELETE"});
      setPaper(null);setResult(null);setAnswers({});
      setNote("Thông tin đăng ký đã được xóa.");
      await reload();
    }catch(e){setError(e instanceof Error?e.message:"Không thể xóa thông tin lúc này.");}
    finally{setBusy(false);}
  }

  const view=overview;
  return <div>
    <h2>9 phiên học của chương trình</h2>
    <div className="content-grid">
      {(view?.lessons??DEFAULT_LESSONS).map(lesson=>
        <article className="info-card" key={lesson.number}>
          <span className="section-kicker">PHIÊN {lesson.number}</span>
          <h3>{lesson.published?lesson.title:"Chưa công bố học liệu"}</h3>
          {lesson.published&&lesson.url?
            <a href={lesson.url} target="_blank" rel="noopener noreferrer">
              Mở học liệu đã duyệt ↗
            </a>:
            <p>Đang chờ đối chiếu và phê duyệt tài liệu chính thức.</p>}
          {(lesson.number===1||lesson.number===9)&&
            <p>Khảo sát sau phiên {lesson.number}: {
              view?.surveysVerified.includes(lesson.number)?
                "Đã được xác nhận bởi hệ thống khảo sát":
                "Chưa có xác nhận hoàn thành"
            }</p>}
        </article>
      )}
    </div>

    {error&&<div className="notice notice-warning" role="alert">{error}</div>}
    {note&&<div className="notice" role="status">{note}</div>}

    <h2>Đăng ký tham gia</h2>
    {view?.learnerReference?
      <div className="demo-panel">
        <p>Bạn đã đăng ký trên thiết bị này. Phiên đăng ký được bảo vệ bằng cookie
          HttpOnly, không hiển thị họ tên hoặc trường học trên trang công khai.</p>
        <button className="button button-outline" disabled={busy}
          onClick={()=>void withdraw()}>Xóa thông tin đăng ký của tôi</button>
      </div>:
      view?.registrationOpen&&view.privacyNoticeUrl?
      <form className="demo-panel" onSubmit={e=>void register(e)}>
        <label className="field">Họ và tên
          <input required minLength={2} maxLength={120} autoComplete="name"
            value={name} onChange={e=>setName(e.target.value)}/>
        </label>
        <label className="field">Trường hoặc cơ sở giáo dục
          <input required minLength={2} maxLength={220}
            value={school} onChange={e=>setSchool(e.target.value)}/>
        </label>
        <label className="field">
          <input type="checkbox" checked={ack} required
            onChange={e=>setAck(e.target.checked)}/>
          Tôi đã đọc <a href={view.privacyNoticeUrl} target="_blank"
            rel="noopener noreferrer">thông báo bảo vệ thông tin cá nhân</a>.
        </label>
        <button className="button button-blue" type="submit" disabled={busy||!ack}>
          {busy?"Đang gửi…":"Đăng ký tham gia"}
        </button>
      </form>:
      <div className="notice notice-warning">
        Biểu mẫu đăng ký chưa kích hoạt. Cần thông báo bảo vệ dữ liệu,
        cơ sở dữ liệu an toàn và quy trình tiếp nhận trước khi mở.
      </div>}

    <h2>Bài kiểm tra cuối khóa</h2>
    <div className="info-card">
      <p><strong>20 câu ngẫu nhiên</strong> từ 90 câu được phê duyệt;
        thời gian <strong>15 phút</strong>; đạt ít nhất <strong>16/20</strong>.
        Có thể làm lại không giới hạn số lượt.</p>
      <p>Hai khảo sát sau phiên 1 và phiên 9 phải được đơn vị cung cấp khảo sát
        xác minh. Việc mở liên kết hoặc quét QR không tự động được tính là đã hoàn thành.</p>
      {!view?.bankReady&&<p>Ngân hàng 90 câu hỏi chính thức chưa được thẩm định đầy đủ.</p>}
      {!view?.examOpen&&!paper&&
        <div className="notice">Bài kiểm tra chính thức chưa được mở cho tài khoản này.</div>}
      {view?.examOpen&&!paper&&<button className="button button-blue"
        disabled={busy} onClick={()=>void start()}>
        {busy?"Đang chuẩn bị…":"Bắt đầu bài kiểm tra"}
      </button>}
    </div>

    {paper&&<section className="demo-panel">
      <h2>Bài thi đang thực hiện</h2>
      <p role="status"><strong>Thời gian còn lại: {Math.floor(remaining/60)
        .toString().padStart(2,"0")}:{(remaining%60).toString().padStart(2,"0")}</strong></p>
      {paper.questions.map(q=><fieldset key={q.position} className="training-question">
        <legend><strong>Câu {q.position}. {q.text}</strong></legend>
        {q.options.map((option,i)=><label key={i} className="training-option">
          <input type="radio" name={"question-"+q.position}
            checked={answers[q.position]===i+1} disabled={busy||remaining===0}
            onChange={()=>setAnswers(a=>({...a,[q.position]:i+1}))}/>
          {String.fromCharCode(65+i)}. {option}
        </label>)}
      </fieldset>)}
      <button className="button button-blue" disabled={busy||remaining===0}
        onClick={()=>void submit()}>Nộp bài</button>
      {remaining===0&&<p>Hết thời gian. Bắt đầu lại để nhận đề khác.</p>}
    </section>}

    {result&&<section className="demo-panel" role="status" aria-live="polite">
      <h2>{result.passed?"Hoàn thành chương trình":"Chưa đạt"}</h2>
      <p>{result.message}</p>
      {!result.passed&&view?.examOpen&&
        <button className="button button-blue" disabled={busy}
          onClick={()=>void start()}>Làm lại bài kiểm tra</button>}
    </section>}
    <p className="notice">
      Chưa phát hành chứng chỉ, xếp hạng hoặc điểm số trên màn hình chúc mừng.
      Dữ liệu khảo sát và nội dung 9 phiên học chỉ được công bố sau kiểm chứng.
    </p>
  </div>;
}
