import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p>404</p>
      <h1>Không tìm thấy bài phân tích</h1>
      <Link href="/">Về trang chủ</Link>
    </main>
  );
}
