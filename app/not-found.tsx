import Link from "next/link";
export default function NotFound() {
  return <main className="container content-section"><h1>Không tìm thấy trang</h1><p>Đường dẫn không tồn tại hoặc nội dung chưa được công bố.</p><Link className="button button-blue" href="/">Về Trang chủ</Link></main>;
}
