import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AnalysisView } from "@/components/analysis-view";
import { getAnalysisBySlug } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!/^[a-f0-9]{12}$/.test(slug)) return {};

  const analysis = await getAnalysisBySlug(slug);
  if (!analysis) return {};

  const canonicalUrl = `/a/${slug}`;
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

export default async function SharedAnalysisPage({
  params,
}: PageProps) {
  const { slug } = await params;
  if (!/^[a-f0-9]{12}$/.test(slug)) notFound();

  const analysis = await getAnalysisBySlug(slug);
  if (!analysis) notFound();

  return (
    <main>
      <nav className="topbar">
        <Link href="/" className="brand">
          <Image
            className="brand-logo"
            src="/esclogo.png"
            alt=""
            width={36}
            height={36}
          />
          Escbase Read
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
