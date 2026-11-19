import Link from "next/link";
import { getDatabasePool } from "@/lib/server/db";
import { publicSurveyLanding,surveyLesson } from "@/lib/server/training-surveys";
import SurveyLaunch from "@/components/SurveyLaunch";
export const dynamic="force-dynamic";
type Props={params:Promise<{number:string}>};

export default async function SurveyLanding({params}:Props){
 const number=surveyLesson((await params).number);
 if(!number)return <main className="container content-section">
   <h1>Không tìm thấy khảo sát</h1><Link href="/dao-tao">Về trang Đào tạo</Link>
 </main>;
 let available=false;
 if(publicSurveyLanding(number)){
   try{
     const result=await getDatabasePool().query(
       "SELECT 1 FROM training_lessons WHERE lesson_number=$1 AND status='published'",
       [number]
     );
     available=result.rowCount===1;
   }catch{available=false;}
 }
 return <main>
  <section className="page-hero"><div className="container">
   <span className="eyebrow">ĐÀO TẠO · KHÔNG MỘT MÌNH 2026</span>
   <h1>Khảo sát sau phiên {number}</h1>
   <p>Chỉ câu trả lời được đơn vị khảo sát xác nhận mới được ghi nhận.</p>
  </div></section>
  <div className="container content-section">
   <SurveyLaunch lesson={number} available={available}/>
   <p><Link href="/dao-tao">← Trở về chương trình Đào tạo</Link></p>
  </div>
 </main>;
}
