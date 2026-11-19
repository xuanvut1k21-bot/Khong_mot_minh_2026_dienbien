"use client";
import { useCallback,useEffect,useState } from "react";

type Lesson={
 number:number;title:string;materialUrl:string;
 status:"draft"|"pending"|"published";isEditor:boolean;
};
type LessonResponse={items:Lesson[];canEdit:boolean;canApprove:boolean};
type Question={
 id:string;text:string;options:string[];correctIndex:number;
 sourceUrl:string;status:"draft"|"pending"|"approved"|"archived";
 authoredBySelf:boolean;
};
type QuestionResponse={
 items:Question[];stats:Record<string,number>;hasMore:boolean;
 canEdit:boolean;canApprove:boolean;page:number;
};
type QForm={text:string;options:[string,string,string,string];
 correctIndex:number;sourceUrl:string};
const emptyQ:QForm={text:"",options:["","","",""],correctIndex:1,sourceUrl:""};
async function requestJson(url:string,options?:RequestInit){
 const response=await fetch(url,{cache:"no-store",credentials:"same-origin",...options});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(
   typeof body.error==="string"?body.error:"REQUEST_FAILED"
 );
 return body;
}
function send(url:string,data:unknown){
 return requestJson(url,{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)
 });
}
const lessonLabels:Record<string,string>={
 draft:"Bản nháp",pending:"Chờ duyệt",published:"Đã công bố"
};
const questionLabels:Record<string,string>={
 draft:"Bản nháp",pending:"Chờ duyệt",approved:"Đã duyệt",archived:"Đã lưu trữ"
};

export default function TrainingEditorial(){
 const [lessons,setLessons]=useState<LessonResponse|null>(null);
 const [questions,setQuestions]=useState<QuestionResponse|null>(null);
 const [filter,setFilter]=useState("all");
 const [page,setPage]=useState(1);
 const [lessonNumber,setLessonNumber]=useState<number|null>(null);
 const [lessonTitle,setLessonTitle]=useState("");
 const [lessonUrl,setLessonUrl]=useState("");
 const [selectedQuestion,setSelectedQuestion]=useState<Question|null>(null);
 const [qform,setQForm]=useState<QForm>(emptyQ);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [info,setInfo]=useState("");

 const load=useCallback(async()=>{
  const [l,q]=await Promise.all([
   requestJson("/api/v1/admin/training/lessons"),
   requestJson("/api/v1/admin/training/questions?"+
    new URLSearchParams({status:filter,page:String(page)}))
  ]);
  setLessons(l);setQuestions(q);
 },[filter,page]);

 useEffect(()=>{
  let cancelled=false;
  Promise.all([
   requestJson("/api/v1/admin/training/lessons"),
   requestJson("/api/v1/admin/training/questions?"+
    new URLSearchParams({status:filter,page:String(page)}))
  ]).then(([l,q])=>{if(!cancelled){setLessons(l);setQuestions(q);}})
   .catch(()=>{if(!cancelled)setError("Không thể tải nội dung quản trị.");});
  return ()=>{cancelled=true;};
 },[filter,page]);

 function openLesson(item:Lesson){
  setLessonNumber(item.number);setLessonTitle(item.title);
  setLessonUrl(item.materialUrl);setError("");setInfo("");
 }
 function openQuestion(item:Question){
  setSelectedQuestion(item);
  setQForm({
   text:item.text,options:item.options.slice(0,4) as QForm["options"],
   correctIndex:item.correctIndex,sourceUrl:item.sourceUrl
  });setError("");setInfo("");
 }
 function newQuestion(){
  setSelectedQuestion(null);setQForm({
   text:"",options:["","","",""],correctIndex:1,sourceUrl:""
  });setError("");setInfo("");
 }
 async function perform(action:()=>Promise<unknown>,success:string){
  setBusy(true);setError("");setInfo("");
  try{await action();await load();setInfo(success);}
  catch(e){setError(e instanceof Error?e.message:"Không thể lưu thay đổi.");}
  finally{setBusy(false);}
 }
 async function lessonAction(action:"save"|"submit"|"return"|"publish"|"withdraw"){
  if(lessonNumber===null)return;
  if(action==="withdraw"&&!window.confirm("Thu hồi học liệu đã công bố? Người học sẽ không thấy phiên này."))return;
  const content={title:lessonTitle.trim(),materialUrl:lessonUrl.trim()};
  await perform(()=>send(
   "/api/v1/admin/training/lessons/"+lessonNumber,
   action==="save"?{action,content}:{action}
  ),"Đã cập nhật trạng thái phiên học.");
 }
 async function questionAction(action:"save"|"submit"|"return"|"approve"|"archive"){
  if(!selectedQuestion)return;
  if(action==="archive"&&!window.confirm("Lưu trữ câu hỏi đã duyệt? Thi mới sẽ không dùng câu này."))return;
  await perform(()=>send(
   "/api/v1/admin/training/questions/"+selectedQuestion.id,
   action==="save"?{action,content:qform}:{action}
  ),"Đã cập nhật câu hỏi.");
 }
 async function createQuestion(e:React.FormEvent){
  e.preventDefault();
  await perform(async()=>{
   await send("/api/v1/admin/training/questions",qform);
   newQuestion();setFilter("draft");setPage(1);
  },"Đã lưu câu hỏi ở trạng thái bản nháp. Chưa dùng trong bài thi.");
 }
 const chosen=lessons?.items.find(x=>x.number===lessonNumber);
 const editableQ=questions?.canEdit && selectedQuestion?.status==="draft"&&
  selectedQuestion.authoredBySelf;
 return <div className="container content-section">
  <div className="notice">
   Chỉ cán bộ được cấp quyền biên soạn hoặc phê duyệt toàn chương trình mới thao tác.
   Người soạn không được tự duyệt. Không nhập dữ liệu học viên hoặc tài liệu chưa được phép
   công bố. Ngân hàng câu hỏi được duyệt tối đa 90 câu.
  </div>
  {error&&<div className="notice notice-warning" role="alert">{error}</div>}
  {info&&<div className="notice" role="status">{info}</div>}

  <h2>Học liệu 9 phiên</h2>
  <div className="content-grid">
   {lessons?.items.map(l=><article className="info-card" key={l.number}>
    <span className="section-kicker">PHIÊN {l.number}</span>
    <h3>{l.title||"Chưa có tiêu đề"}</h3>
    <p><strong>Trạng thái:</strong> {lessonLabels[l.status]}</p>
    {l.materialUrl&&<p><a href={l.materialUrl} target="_blank" rel="noopener noreferrer">
      Kiểm tra nguồn Drive ↗</a></p>}
    <button className="button button-outline" disabled={busy}
     onClick={()=>openLesson(l)}>Mở hồ sơ phiên học</button>
   </article>)}
  </div>
  {chosen&&<section className="demo-panel" style={{marginTop:20}}>
   <h3>Phiên {chosen.number} · {lessonLabels[chosen.status]}</h3>
   <label className="field">Tên phiên học
    <input maxLength={250} minLength={3} value={lessonTitle}
     disabled={chosen.status!=="draft"||!lessons?.canEdit}
     onChange={e=>setLessonTitle(e.target.value)}/>
   </label>
   <label className="field">URL học liệu Drive được phê duyệt quyền sử dụng
    <input type="url" maxLength={500} value={lessonUrl}
     disabled={chosen.status!=="draft"||!lessons?.canEdit}
     onChange={e=>setLessonUrl(e.target.value)}
     placeholder="https://drive.google.com/file/d/.../view"/>
   </label>
   <div className="button-row">
    {lessons?.canEdit&&chosen.status==="draft"&&<>
     <button className="button button-blue" disabled={busy||lessonTitle.trim().length<3}
      onClick={()=>void lessonAction("save")}>Lưu bản nháp</button>
     <button className="button button-outline" disabled={busy||!chosen.title}
      onClick={()=>void lessonAction("submit")}>Gửi duyệt học liệu đã lưu</button>
    </>}
    {lessons?.canApprove&&chosen.status==="pending"&&<>
     <button className="button button-blue" disabled={busy||chosen.isEditor}
      onClick={()=>void lessonAction("publish")}>Duyệt và công bố</button>
     <button className="button button-outline" disabled={busy}
      onClick={()=>void lessonAction("return")}>Trả về bản nháp</button>
    </>}
    {lessons?.canApprove&&chosen.status==="published"&&
     <button className="button button-outline" disabled={busy}
      onClick={()=>void lessonAction("withdraw")}>Thu hồi học liệu</button>}
    <button className="button button-outline" disabled={busy}
     onClick={()=>setLessonNumber(null)}>Đóng</button>
   </div>
   <p>Gửi duyệt chỉ áp dụng cho dữ liệu đã lưu; sau khi lưu hãy tải lại hồ sơ
    trước khi gửi để kiểm tra nội dung.</p>
  </section>}

  <h2 style={{marginTop:32}}>Ngân hàng câu hỏi cuối khóa</h2>
  <div className="info-card">
   <p><strong>Số câu đã duyệt:</strong> {questions?.stats?.approved??0} / 90.
    Chỉ khi đúng 90 câu và 9 học liệu đã công bố mới xét mở thi;
    người học còn phải hoàn thành hai khảo sát.</p>
   <p>Bản nháp: {questions?.stats?.draft??0} ·
    Chờ duyệt: {questions?.stats?.pending??0} ·
    Lưu trữ: {questions?.stats?.archived??0}</p>
  </div>
  <label className="field">Lọc câu hỏi
   <select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);setSelectedQuestion(null);}}>
    <option value="all">Tất cả</option>
    <option value="draft">Bản nháp</option>
    <option value="pending">Chờ duyệt</option>
    <option value="approved">Đã duyệt</option>
    <option value="archived">Đã lưu trữ</option>
   </select>
  </label>
  <div className="content-grid">
   {questions?.items.map(q=><article className="info-card" key={q.id}>
    <span className="section-kicker">{questionLabels[q.status]}</span>
    <h3>{q.text}</h3>
    <p>Đáp án đúng chỉ hiển thị trong khu vực quản trị đã phân quyền.</p>
    <button className="button button-outline" disabled={busy}
     onClick={()=>openQuestion(q)}>Mở hồ sơ câu hỏi</button>
   </article>)}
  </div>
  <div className="button-row">
   <button className="button button-outline" disabled={busy||page===1}
    onClick={()=>setPage(p=>Math.max(1,p-1))}>Trang trước</button>
   <span>Trang {page}</span>
   <button className="button button-outline" disabled={busy||!questions?.hasMore}
    onClick={()=>setPage(p=>p+1)}>Trang tiếp</button>
  </div>
  {questions?.canEdit&&<button className="button button-blue"
   onClick={newQuestion} disabled={busy}>Soạn câu hỏi mới</button>}
  {(questions?.canEdit||selectedQuestion)&&
   <form className="demo-panel" style={{marginTop:20}} onSubmit={e=>{
     e.preventDefault();if(!selectedQuestion)void createQuestion(e);
     else void questionAction("save");
   }}>
    <h3>{selectedQuestion?questionLabels[selectedQuestion.status]:"Câu hỏi mới"}</h3>
    <label className="field">Nội dung câu hỏi
     <textarea rows={3} minLength={10} maxLength={2000} value={qform.text}
      disabled={busy||!!selectedQuestion&&!editableQ}
      onChange={e=>setQForm(f=>({...f,text:e.target.value}))}/>
    </label>
    {qform.options.map((option,i)=><label className="field" key={i}>
      Phương án {String.fromCharCode(65+i)}
      <textarea rows={2} minLength={1} maxLength={700} value={option}
       disabled={busy||!!selectedQuestion&&!editableQ}
       onChange={e=>setQForm(f=>{
        const options=[...f.options] as QForm["options"];
        options[i]=e.target.value;return {...f,options};
       })}/>
     </label>)}
    <label className="field">Đáp án chính xác
     <select value={qform.correctIndex}
      disabled={busy||!!selectedQuestion&&!editableQ}
      onChange={e=>setQForm(f=>({...f,correctIndex:Number(e.target.value)}))}>
      {[1,2,3,4].map(x=><option value={x} key={x}>Phương án {String.fromCharCode(64+x)}</option>)}
     </select>
    </label>
    <label className="field">Nguồn thẩm định (liên kết tệp Drive)
     <input type="url" maxLength={500} value={qform.sourceUrl}
      disabled={busy||!!selectedQuestion&&!editableQ}
      onChange={e=>setQForm(f=>({...f,sourceUrl:e.target.value}))}/>
    </label>
    <div className="button-row">
     {(!selectedQuestion||editableQ)&&
      <button className="button button-blue" type="submit"
       disabled={busy||qform.text.trim().length<10}>Lưu bản nháp</button>}
     {selectedQuestion?.status==="draft"&&editableQ&&
      <button type="button" className="button button-outline" disabled={busy}
       onClick={()=>void questionAction("submit")}>Gửi duyệt câu hỏi đã lưu</button>}
     {selectedQuestion?.status==="pending"&&questions?.canApprove&&<>
      <button type="button" className="button button-blue"
       disabled={busy||selectedQuestion.authoredBySelf}
       onClick={()=>void questionAction("approve")}>Phê duyệt</button>
      <button type="button" className="button button-outline" disabled={busy}
       onClick={()=>void questionAction("return")}>Trả về</button>
     </>}
     {selectedQuestion?.status==="approved"&&questions?.canApprove&&
      <button type="button" className="button button-outline" disabled={busy}
       onClick={()=>void questionAction("archive")}>Lưu trữ / Ngừng sử dụng</button>}
     <button type="button" className="button button-outline" disabled={busy}
      onClick={newQuestion}>Đóng hồ sơ</button>
    </div>
    {selectedQuestion&&<p>Thay đổi nội dung không tự động công bố. Câu đã phê duyệt
      không được sửa trực tiếp; cần lưu trữ và tạo câu hỏi mới để thay thế.</p>}
   </form>}
 </div>;
}
