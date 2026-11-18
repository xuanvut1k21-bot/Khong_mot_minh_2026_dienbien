"use client";

import { useCallback, useEffect, useState } from "react";

type Status = "draft"|"pending"|"approved"|"published"|"archived";
type Category = "workshop"|"five_minutes"|"training"|"ambassador"|"community";
type Unit = {id:string;public_name:string};
type Activity = {
  id:string;organization_id:string;organization_name:string;
  title:string;slug:string;summary:string;category_code:Category;
  publish_status:Status;event_status:string;starts_at:string|null;location_label:string|null;
  created_by:string|null;submitted_by:string|null;approved_by:string|null;
  can_edit:boolean;can_approve:boolean;can_publish:boolean;can_verify:boolean;
  result_status:"draft"|"verified"|null;
  sessions_count:number|null;attendance_count:number|null;result_summary:string|null;
};
type FormData = {
  organizationId:string;title:string;slug:string;summary:string;category:Category;
  startsAt:string;location:string;
};
const empty:FormData={
  organizationId:"",title:"",slug:"",summary:"",category:"workshop",startsAt:"",location:""
};
const categories:Record<Category,string>={
  workshop:"Hội thảo / Truyền thông",five_minutes:"5 phút an toàn mạng",
  training:"Tập huấn",ambassador:"Đại sứ",community:"Cộng đồng"
};
const statusLabels:Record<Status,string>={
  draft:"Bản nháp",pending:"Chờ duyệt",approved:"Đã duyệt",
  published:"Đã công bố",archived:"Lưu trữ"
};
function toSlug(title:string):string {
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/đ/g,"d").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,160);
}

async function requestJson(path:string,options?:RequestInit) {
  const response=await fetch(path,{credentials:"same-origin",cache:"no-store",...options});
  const body=await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(
    typeof body.error==="string" ? body.error : "REQUEST_FAILED"
  );
  return body;
}
function bodyPost(path:string,body:unknown,method="POST") {
  return requestJson(path,{
    method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
  });
}

export default function ActivityManager() {
  const [items,setItems]=useState<Activity[]>([]);
  const [units,setUnits]=useState<Unit[]>([]);
  const [status,setStatus]=useState("all");
  const [page,setPage]=useState(1);
  const [form,setForm]=useState<FormData>(empty);
  const [editing,setEditing]=useState<string|null>(null);
  const [resultId,setResultId]=useState<string|null>(null);
  const [sessions,setSessions]=useState("0");
  const [attendance,setAttendance]=useState("0");
  const [resultSummary,setResultSummary]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  const load=useCallback(async(signal?:AbortSignal)=>{
    const params=new URLSearchParams({status,page:String(page)});
    const data=await requestJson(
      "/api/v1/admin/activities?"+params.toString(),{signal}
    );
    if (!signal?.aborted) setItems(data.items ?? []);
  },[status,page]);

  useEffect(()=>{
    const controller=new AbortController();
    load(controller.signal).catch(()=>{
      if(!controller.signal.aborted)setError("Không tải được danh sách hoạt động.");
    });
    return ()=>controller.abort();
  },[load]);

  useEffect(()=>{
    const controller=new AbortController();
    requestJson("/api/v1/admin/organizations",{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted)setUnits(data.items ?? []);})
      .catch(()=>{if(!controller.signal.aborted)setError("Không lấy được danh sách đơn vị.");});
    return ()=>controller.abort();
  },[]);

  function updateForm<K extends keyof FormData>(key:K,value:FormData[K]) {
    setForm(old=>({...old,[key]:value}));
  }
  function startEdit(item:Activity) {
    const localTime=item.starts_at?
      new Date(item.starts_at).toLocaleString("sv-SE").replace(" ","T").slice(0,16):"";
    setForm({
      organizationId:item.organization_id,title:item.title,slug:item.slug,
      summary:item.summary,category:item.category_code,
      startsAt:localTime,location:item.location_label??""
    });
    setEditing(item.id);
    setResultId(null);
    setError("");setMessage("");
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function resetForm() {setEditing(null);setForm(empty);}

  async function submitForm(event:React.FormEvent) {
    event.preventDefault();
    setBusy(true);setError("");setMessage("");
    const startsAt=form.startsAt?new Date(form.startsAt).toISOString():null;
    const body={
      title:form.title.trim(),slug:form.slug.trim(),summary:form.summary.trim(),
      category:form.category,startsAt,location:form.location.trim()||null
    };
    try {
      if (editing) {
        await bodyPost("/api/v1/admin/activities/"+editing,body,"PATCH");
      } else {
        await bodyPost("/api/v1/admin/activities",{...body,organizationId:form.organizationId});
      }
      setMessage(editing?"Đã lưu bản nháp.":"Đã tạo hoạt động ở trạng thái bản nháp.");
      resetForm();await load();
    } catch(e) {setError(e instanceof Error?e.message:"Lưu không thành công.");}
    finally {setBusy(false);}
  }

  async function transition(item:Activity,action:"submit"|"return"|"approve"|"publish"|"complete") {
    if (action==="publish" && !window.confirm("Xác nhận công bố hoạt động cho người xem?")) return;
    setBusy(true);setError("");setMessage("");
    try {
      await bodyPost("/api/v1/admin/activities/"+item.id+"/transition",{action});
      setMessage("Đã chuyển trạng thái hoạt động.");
      await load();
    } catch(e) {setError(e instanceof Error?e.message:"Thao tác không thành công.");}
    finally {setBusy(false);}
  }

  function openResult(item:Activity) {
    setResultId(item.id);setSessions(String(item.sessions_count??0));
    setAttendance(String(item.attendance_count??0));setResultSummary(item.result_summary??"");
    setError("");setMessage("");
  }
  async function saveResult() {
    if(!resultId)return;
    const sessionsCount=Number(sessions);
    const attendanceCount=Number(attendance);
    if(!Number.isInteger(sessionsCount)||!Number.isInteger(attendanceCount)||
      sessionsCount<0||attendanceCount<0) {
      setError("Số buổi và lượt tham dự phải là số nguyên không âm.");return;
    }
    setBusy(true);setError("");setMessage("");
    try {
      await bodyPost("/api/v1/admin/activities/"+resultId+"/results",{
        action:"save",sessionsCount,attendanceCount,summary:resultSummary.trim()
      });
      setResultId(null);setMessage("Đã lưu kết quả nháp; cần cán bộ khác xác minh.");
      await load();
    } catch(e) {setError(e instanceof Error?e.message:"Không lưu được kết quả.");}
    finally {setBusy(false);}
  }
  async function verifyResult(item:Activity) {
    if(!window.confirm("Xác minh và công bố số liệu kết quả này?"))return;
    setBusy(true);setError("");setMessage("");
    try {
      await bodyPost("/api/v1/admin/activities/"+item.id+"/results",{action:"verify"});
      setMessage("Đã xác minh kết quả. Số liệu đủ điều kiện hiển thị công khai.");
      await load();
    } catch(e) {setError(e instanceof Error?e.message:"Không xác minh được.");}
    finally {setBusy(false);}
  }

  return <div className="container content-section">
    <h2>Quản lý hoạt động hưởng ứng</h2>
    <p>Chỉ cán bộ được cấp quyền mới có thể nhập và duyệt hoạt động. Phê duyệt phải do người khác người nhập hoặc gửi duyệt thực hiện.</p>
    {error && <div className="notice notice-warning" role="alert">{error}</div>}
    {message && <div className="notice" role="status">{message}</div>}

    {units.length>0 && <form onSubmit={e=>void submitForm(e)} className="demo-panel">
      <h3>{editing?"Chỉnh sửa bản nháp":"Tạo hoạt động mới"}</h3>
      <label className="field">Đơn vị tổ chức
        <select value={form.organizationId} disabled={Boolean(editing)}
          required onChange={e=>updateForm("organizationId",e.target.value)}>
          <option value="">Chọn đơn vị</option>
          {units.map(u=><option key={u.id} value={u.id}>{u.public_name}</option>)}
        </select>
      </label>
      <label className="field">Tiêu đề
        <input required minLength={3} maxLength={300} value={form.title}
          onChange={e=>{
            const name=e.target.value;
            setForm(f=>({...f,title:name,slug:editing?f.slug:toSlug(name)}));
          }}/>
      </label>
      <label className="field">Đường dẫn ngắn không dấu
        <input required maxLength={160} pattern="[a-z0-9]+(-[a-z0-9]+)*"
          value={form.slug} onChange={e=>updateForm("slug",e.target.value)}/>
      </label>
      <label className="field">Danh mục
        <select value={form.category}
          onChange={e=>updateForm("category",e.target.value as Category)}>
          {(Object.keys(categories) as Category[]).map(c=>
            <option key={c} value={c}>{categories[c]}</option>)}
        </select>
      </label>
      <label className="field">Ngày giờ tổ chức (giờ tại trình duyệt)
        <input type="datetime-local" value={form.startsAt}
          onChange={e=>updateForm("startsAt",e.target.value)}/>
      </label>
      <label className="field">Địa điểm
        <input maxLength={220} value={form.location}
          onChange={e=>updateForm("location",e.target.value)}/>
      </label>
      <label className="field">Tóm tắt công khai
        <textarea rows={4} maxLength={10000} value={form.summary}
          onChange={e=>updateForm("summary",e.target.value)}/>
      </label>
      <div className="button-row">
        <button className="button button-blue" disabled={busy||!form.organizationId} type="submit">
          {editing?"Lưu chỉnh sửa":"Lưu bản nháp"}
        </button>
        {editing && <button className="button button-outline" type="button"
          onClick={resetForm}>Hủy chỉnh sửa</button>}
      </div>
    </form>}
    {units.length===0 && <div className="notice">Chưa có đơn vị được cấp quyền nhập hoạt động, hoặc danh mục đơn vị chưa được cấu hình.</div>}

    <h2>Danh sách hoạt động</h2>
    <label className="field">Lọc trạng thái
      <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>
        {["all","draft","pending","approved","published","archived"].map(s=>
          <option key={s} value={s}>{s==="all"?"Tất cả":statusLabels[s as Status]}</option>)}
      </select>
    </label>
    {items.length===0 && <div className="empty-state">Chưa có hoạt động thuộc phạm vi được xem.</div>}
    <div className="content-grid">
      {items.map(a=><article className="info-card" key={a.id}>
        <span className="section-kicker">{a.organization_name}</span>
        <h3>{a.title}</h3>
        <p>{a.summary}</p>
        <p><strong>{statusLabels[a.publish_status]}</strong> · {a.event_status}</p>
        {a.result_status==="verified" && <p>Kết quả xác minh: {a.sessions_count} buổi, {a.attendance_count} lượt.</p>}
        <div className="button-row">
          {a.publish_status==="draft" && a.can_edit &&
            <button className="button button-outline" disabled={busy} onClick={()=>startEdit(a)}>Sửa</button>}
          {a.publish_status==="draft" && a.can_edit &&
            <button className="button button-blue" disabled={busy} onClick={()=>void transition(a,"submit")}>Gửi duyệt</button>}
          {["pending","approved"].includes(a.publish_status) && a.can_approve &&
            <button className="button button-outline" disabled={busy} onClick={()=>void transition(a,"return")}>Trả lại bản nháp</button>}
          {a.publish_status==="pending" && a.can_approve &&
            <button className="button button-blue" disabled={busy} onClick={()=>void transition(a,"approve")}>Phê duyệt</button>}
          {a.publish_status==="approved" && a.can_publish &&
            <button className="button button-blue" disabled={busy} onClick={()=>void transition(a,"publish")}>Công bố</button>}
          {a.publish_status==="published" && a.event_status==="planned" && a.can_edit &&
            <button className="button button-outline" disabled={busy} onClick={()=>void transition(a,"complete")}>Đánh dấu đã tổ chức</button>}
          {a.publish_status==="published" && a.event_status==="completed" &&
            a.result_status!=="verified" && a.can_edit &&
            <button className="button button-outline" disabled={busy} onClick={()=>openResult(a)}>Nhập kết quả</button>}
          {a.result_status==="draft" && a.can_verify &&
            <button className="button button-blue" disabled={busy} onClick={()=>void verifyResult(a)}>Xác minh kết quả</button>}
        </div>
      </article>)}
    </div>
    {items.length===20 || page>1 ? <div className="button-row">
      <button className="button button-outline" disabled={busy||page<=1}
        onClick={()=>setPage(p=>Math.max(1,p-1))}>Trang trước</button>
      <span>Trang {page}</span>
      <button className="button button-outline" disabled={busy||items.length<20}
        onClick={()=>setPage(p=>p+1)}>Trang sau</button>
    </div> : null}
    {resultId && <div className="demo-panel">
      <h3>Nhập kết quả thực tế</h3>
      <p>Chỉ sử dụng số liệu đã kiểm tra. Kết quả sẽ ở trạng thái nháp cho tới khi có người khác xác minh.</p>
      <label className="field">Số buổi
        <input type="number" min="0" max="100000" value={sessions}
          onChange={e=>setSessions(e.target.value)}/>
      </label>
      <label className="field">Số lượt tham gia
        <input type="number" min="0" max="10000000" value={attendance}
          onChange={e=>setAttendance(e.target.value)}/>
      </label>
      <label className="field">Tổng kết hoạt động
        <textarea rows={5} minLength={10} maxLength={10000} value={resultSummary}
          onChange={e=>setResultSummary(e.target.value)}/>
      </label>
      <div className="button-row">
        <button className="button button-blue" disabled={busy} onClick={()=>void saveResult()}>Lưu kết quả nháp</button>
        <button className="button button-outline" disabled={busy} onClick={()=>setResultId(null)}>Đóng</button>
      </div>
    </div>}
  </div>;
}
