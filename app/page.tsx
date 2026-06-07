import { Analyzer } from "@/components/analyzer";
import { getTodayAnalyses } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
  const todayAnalyses = await getTodayAnalyses();

  return (
    <main>
      <Analyzer initialTodayAnalyses={todayAnalyses} />
      <footer className="site-footer">
        <p>Nguồn công khai • Tóm tắt có phân biệt dữ kiện và ý kiến</p>
      </footer>
    </main>
  );
}
