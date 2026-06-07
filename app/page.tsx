import { Analyzer } from "@/components/analyzer";
import Link from "next/link";

export default function Home() {
  return (
    <main>
      <nav className="topbar">
        <Link href="/" className="brand" aria-label="ThreadBrief trang chủ">
          <span>TB</span>
          ThreadBrief
        </Link>
        <span className="topbar-note">Vietnamese AI reader</span>
      </nav>
      <Analyzer />
      <footer className="site-footer">
        <span>ThreadBrief</span>
        <p>Nguồn công khai • Tóm tắt có phân biệt dữ kiện và ý kiến</p>
      </footer>
    </main>
  );
}
