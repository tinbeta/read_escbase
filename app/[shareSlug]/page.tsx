import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AnalysisView } from "@/components/analysis-view";
import { getAnalysisPath, extractAnalysisId } from "@/lib/share-url";
import { getAnalysisBySlug } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ shareSlug: string }>;
};

async function getSharedAnalysis(shareSlug: string) {
  const id = extractAnalysisId(shareSlug);
  if (!id) return null;
  return getAnalysisBySlug(id);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareSlug } = await params;
  const analysis = await getSharedAnalysis(shareSlug);
  if (!analysis) return {};

  const canonicalUrl = getAnalysisPath(analysis.result.title, analysis.slug);
  return {
    title: { absolute: analysis.result.title },
    description: null,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: analysis.result.title,
      url: canonicalUrl,
      siteName: "Escbase Read",
      locale: "vi_VN",
      type: "article",
      images: [
        {
          url: "/escbase-read-og.png",
          width: 1200,
          height: 630,
          alt: "Escbase Read",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: analysis.result.title,
      images: ["/escbase-read-og.png"],
    },
  };
}

export default async function SharedAnalysisPage({ params }: PageProps) {
  const { shareSlug } = await params;
  const analysis = await getSharedAnalysis(shareSlug);
  if (!analysis) notFound();

  const canonicalPath = getAnalysisPath(analysis.result.title, analysis.slug);
  if (`/${shareSlug}` !== canonicalPath) redirect(canonicalPath);

  return (
    <main>
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
