import { notFound, redirect } from "next/navigation";
import { getAnalysisPath } from "@/lib/share-url";
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
  redirect(getAnalysisPath(analysis.result.title, analysis.slug));
}
