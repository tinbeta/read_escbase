import { Analyzer } from "@/components/analyzer";
import Image from "next/image";
import Link from "next/link";
import { getTodayAnalyses } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
  const todayAnalyses = await getTodayAnalyses();

  return (
    <main>
      <nav className="topbar">
        <Link href="/" className="brand" aria-label="Escbase Read trang chủ">
          <Image
            className="brand-logo"
            src="/esclogo.png"
            alt=""
            width={36}
            height={36}
            priority
          />
          Escbase Read
        </Link>
        <span className="topbar-note">AI reader tiếng Việt</span>
      </nav>
      <Analyzer initialTodayAnalyses={todayAnalyses} />
      <footer className="site-footer">
        <span>Escbase Read</span>
        <p>Nguồn công khai • Tóm tắt có phân biệt dữ kiện và ý kiến</p>
      </footer>
    </main>
  );
}
