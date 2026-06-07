import { notFound } from "next/navigation";
import Link from "next/link";
import { AnalysisView } from "@/components/analysis-view";
import { getAnalysisBySlug } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SharedAnalysisPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-f0-9]{12}$/.test(slug)) notFound();

  const analysis = await getAnalysisBySlug(slug);
  if (!analysis) notFound();

  return (
    <main>
      <nav className="topbar">
        <Link href="/" className="brand">
          <span>TB</span>
          ThreadBrief
        </Link>
        <Link className="new-analysis-link" href="/">Phân tích link khác</Link>
      </nav>
      <div className="shared-page">
        <AnalysisView
          result={analysis.result}
          sourceUrl={analysis.sourceUrl}
          slug={analysis.slug}
        />
      </div>
    </main>
  );
}
