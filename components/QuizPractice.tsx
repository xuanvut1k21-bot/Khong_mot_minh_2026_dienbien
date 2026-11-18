"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Question = { text: string; options: [string,string,string]; correct: number };

const basic:Question[] = [
  {text:"Có người lạ yêu cầu mã OTP, bạn nên làm gì?",options:["Cung cấp cho họ","Không cung cấp và xác minh","Đăng mã vào nhóm"],correct:1},
  {text:"Khi nhận một đường link lạ hứa nhận quà, bạn nên?",options:["Mở và nhập mật khẩu","Chuyển tiếp cho mọi người","Kiểm tra nguồn, không nhập thông tin nhạy cảm"],correct:2},
  {text:"Ai có thể hỗ trợ học sinh khi gặp nguy cơ trực tuyến?",options:["Người lớn đáng tin cậy","Chỉ tài khoản ẩn danh","Không ai"],correct:0},
  {text:"Trước khi đăng ảnh người khác, bạn nên?",options:["Xin phép và cân nhắc riêng tư","Đăng ngay","Gắn thẻ càng nhiều càng tốt"],correct:0},
  {text:"Khi bạn nhận thấy tin tức đáng ngờ, việc nên làm là?",options:["Chia sẻ tức thì","Kiểm chứng nguồn","Sửa tiêu đề để câu tương tác"],correct:1},
  {text:"Bạn nên làm gì khi bị bắt nạt trong nhóm chat?",options:["Đáp trả bằng lời xúc phạm","Chia sẻ khắp mạng","Báo cáo và tìm người hỗ trợ"],correct:2},
  {text:"Mật khẩu cá nhân nên được xử lý thế nào?",options:["Chia sẻ với người lạ","Giữ bí mật và dùng bảo mật phù hợp","Đặt giống tên tài khoản"],correct:1},
  {text:"Người quen qua mạng yêu cầu gửi địa chỉ nhà, bạn nên?",options:["Không chia sẻ thông tin riêng tư","Gửi ngay","Đăng địa chỉ công khai"],correct:0},
  {text:"Khi bị đăng nhập tài khoản bất thường, bạn nên?",options:["Bỏ qua","Đổi mật khẩu, kiểm tra bảo mật","Đưa mã xác minh cho người gọi"],correct:1},
  {text:"Hình ảnh gây tổn thương người khác có nên chia sẻ tiếp?",options:["Có","Chia sẻ trong nhóm kín","Không lan truyền"],correct:2},
  {text:"Bạn bè kể bị đe dọa trên mạng, bạn nên?",options:["Lắng nghe và giúp tìm hỗ trợ","Chê cười","Ép kể công khai"],correct:0},
  {text:"Xác thực nhiều yếu tố giúp?",options:["Tăng khả năng bảo vệ tài khoản","Làm lộ OTP","Không có tác dụng"],correct:0},
  {text:"Một tài khoản tự nhận là giáo viên hỏi mật khẩu, bạn nên?",options:["Đưa ngay","Từ chối và xác minh qua kênh chính thức","Đổi ảnh đại diện"],correct:1},
  {text:"Khi gặp thông tin sai về người khác, bạn nên?",options:["Tiếp tay lan truyền","Bình luận chế giễu","Không chia sẻ và báo cáo phù hợp"],correct:2},
  {text:"Kết nối an toàn trên mạng là?",options:["Tôn trọng ranh giới và quyền riêng tư","Buộc người khác trả lời","Chia sẻ hết thông tin cá nhân"],correct:0}
];
const advanced:Question[] = [
  {text:"Đoạn ghi âm giống giọng người thân yêu cầu chuyển tiền: bước phù hợp nhất?",options:["Chuyển ngay","Xác minh qua kênh khác đã biết","Đăng công khai"],correct:1},
  {text:"Tài khoản giả danh cơ quan yêu cầu OTP, bạn nên?",options:["Không cung cấp và xác minh chính thức","Gửi mã","Đưa thêm mật khẩu"],correct:0},
  {text:"Một ảnh được tạo bởi AI có vẻ đáng tin cậy: nên?",options:["Tin ngay","Chia sẻ vì hình rõ","Kiểm chứng nguồn và ngữ cảnh"],correct:2},
  {text:"Có người gửi hình ảnh riêng tư nhạy cảm của trẻ em, bạn nên?",options:["Không lưu/phát tán, báo kênh có thẩm quyền","Lưu về máy","Chia sẻ vào nhóm"],correct:0},
  {text:"Một trang đăng nhập có địa chỉ khác trang chính thức: nên?",options:["Nhập mật khẩu thử","Không nhập, truy cập trang chính thức","Chuyển cho bạn bè"],correct:1},
  {text:"Trong lớp học trực tuyến, quản trị viên cần?",options:["Đăng mật khẩu lớp công khai","Cho người lạ quyền quản trị","Giới hạn truy cập và bảo vệ dữ liệu"],correct:2},
  {text:"Tin nhắn yêu cầu cung cấp danh sách học sinh, nên?",options:["Kiểm tra thẩm quyền và mục đích hợp lệ","Gửi ngay","Đăng công khai"],correct:0},
  {text:"Đường link rút gọn không rõ đích, nên?",options:["Bấm ngay","Xác minh nguồn trước","Chuyển tiếp"],correct:1},
  {text:"Tài khoản liên tục đăng nhập trái phép, nên?",options:["Bỏ mặc","Cung cấp mật khẩu cho người lạ","Bảo vệ tài khoản và liên hệ kênh chính thức"],correct:2},
  {text:"Bạn bị gắn tên vào bài đăng sai sự thật: nên?",options:["Lưu thông tin tham chiếu an toàn và báo cáo","Đe dọa người đăng","Đăng thông tin riêng tư của họ"],correct:0},
  {text:"Dùng máy tính công cộng, cần?",options:["Lưu mật khẩu","Đăng xuất và không lưu thông tin","Giữ tài khoản luôn đăng nhập"],correct:1},
  {text:"Cán bộ cần sử dụng ảnh học sinh trong truyền thông: nên?",options:["Đăng ngay","Đưa kèm địa chỉ nhà","Kiểm tra quyền công bố và bảo vệ danh tính"],correct:2},
  {text:"Khi phát hiện trang web lừa đảo, nên?",options:["Báo cáo qua kênh phù hợp","Tự đăng nhập thử","Chia sẻ link để mọi người xem"],correct:0},
  {text:"Bạn bè muốn giữ bí mật việc bị đe dọa trên mạng, bạn nên?",options:["Phớt lờ","Tôn trọng và tìm người lớn tin cậy hỗ trợ","Phát tán câu chuyện"],correct:1},
  {text:"Một thông báo AI giả mạo lãnh đạo yêu cầu mật khẩu, nên?",options:["Làm theo","Hỏi trong nhóm công khai","Xác minh lại qua đầu mối chính thức"],correct:2}
];

function shuffled<T>(input:T[]):T[] {
  const out=input.slice();
  for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}

export function QuizPractice() {
  const [level,setLevel]=useState<"basic"|"advanced">("basic");
  const [status,setStatus]=useState<"ready"|"playing"|"finished">("ready");
  const [questions,setQuestions]=useState<Question[]>([]);
  const [index,setIndex]=useState(0);
  const [score,setScore]=useState(0);
  const [remaining,setRemaining]=useState(15);
  const startAt=useRef(0);
  const inFlight=useRef(false);

  const next=useCallback((answer:number)=>{
    if(inFlight.current || status!=="playing")return;
    inFlight.current=true;
    const spent=Math.min(15000,Math.max(0,Date.now()-startAt.current));
    const question=questions[index];
    if(answer===question.correct && spent<15000){
      setScore(old=>old+(spent<=5000?3:spent<=10000?2:1));
    }
    if(index>=questions.length-1){setStatus("finished");}
    else{startAt.current=Date.now();setIndex(old=>old+1);}
    setTimeout(()=>{inFlight.current=false;},0);
  },[index,questions,status]);

  useEffect(()=>{
    if(status!=="playing")return;
    const timer=setInterval(()=>{
      const left=Math.max(0,15000-(Date.now()-startAt.current));
      setRemaining(left/1000);
      if(left<=0)next(-1);
    },100);
    return ()=>clearInterval(timer);
  },[status,index,next]);

  function begin(){
    setQuestions(shuffled(level==="basic"?basic:advanced));
    setIndex(0);setScore(0);setRemaining(15);
    inFlight.current=false;startAt.current=Date.now();setStatus("playing");
  }

  return (
    <section className="content-section">
      <h2>Thử giao diện Quiz – Quà</h2>
      <div className="notice notice-warning"><strong>Bản chơi thử:</strong> Bộ câu hỏi minh họa chưa phải ngân hàng 60 câu/mức độ đã thẩm định. Điểm tính tại thiết bị, không lưu máy chủ, không tính xếp hạng hoặc giải thưởng.</div>
      <div className="demo-panel">
        {status==="ready" && <>
          <label className="field">Chọn mức độ
            <select value={level} onChange={e=>setLevel(e.target.value as "basic"|"advanced")}>
              <option value="basic">Cơ bản</option><option value="advanced">Cấp cao</option>
            </select>
          </label>
          <p>15 câu hỏi, mỗi câu 15 giây. Trả lời đúng trong 5 giây được 3 điểm; trong 10 giây được 2 điểm; còn lại trong hạn được 1 điểm.</p>
          <button className="button button-blue" onClick={begin}>Bắt đầu chơi thử</button>
        </>}
        {status==="playing" && questions[index] && <>
          <div className="meta-row"><span>Câu {index+1}/15 · {score}/45 điểm</span><span aria-live="off">{remaining.toFixed(1)} giây</span></div>
          <div className="progress"><span style={{width:Math.max(0,remaining/15*100)+"%"}} /></div>
          <h3 className="quiz-question">{questions[index].text}</h3>
          {questions[index].options.map((option,i)=><button className="quiz-answer" onClick={()=>next(i)} key={i}>{String.fromCharCode(65+i)}. {option}</button>)}
        </>}
        {status==="finished" && <>
          <h3 className="quiz-question">Hoàn thành lượt chơi thử!</h3>
          <p className="quiz-leaderboard-score">Điểm: {score}/45</p>
          <p>Chưa có bảng xếp hạng thật. Khi triển khai chính thức, việc bấm giờ, tính điểm và xếp hạng phải diễn ra tại máy chủ.</p>
          <button className="button button-blue" onClick={begin}>Chơi lại</button>
          <button className="button button-outline" style={{marginLeft:10}} onClick={()=>setStatus("ready")}>Đổi mức độ</button>
        </>}
      </div>
    </section>
  );
}
