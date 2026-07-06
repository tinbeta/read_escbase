import { AuthGate } from "@/components/auth-gate";
import { Analyzer } from "@/components/analyzer";

export const dynamic = "force-dynamic";

export default async function Home() {
  return (
    <AuthGate>
      <main>
        <Analyzer initialTodayAnalyses={{ count: 0, items: [] }} />
        <footer className="site-footer">
          <p>Nguồn công khai • Tóm tắt có phân biệt dữ kiện và ý kiến</p>
        </footer>
      </main>
    </AuthGate>
  );
}
