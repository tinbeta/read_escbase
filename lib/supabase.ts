import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { AnalysisResult } from "@/lib/schemas";
import type { SourceType, StoredAnalysis } from "@/lib/types";

export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) return null;

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function findRecentAnalysis(sourceUrl: string): Promise<StoredAnalysis | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const configuredHours = Number(process.env.CACHE_TTL_HOURS ?? 168);
  const cacheHours =
    Number.isFinite(configuredHours) && configuredHours > 0
      ? Math.min(configuredHours, 24 * 365)
      : 168;
  const since = new Date(Date.now() - cacheHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("analyses")
    .select("slug, source_url, source_type, result, created_at")
    .eq("source_url", sourceUrl)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    slug: data.slug,
    sourceUrl: data.source_url,
    sourceType: data.source_type as SourceType,
    result: data.result as AnalysisResult,
    createdAt: data.created_at,
  };
}

export async function saveAnalysis(input: {
  sourceUrl: string;
  sourceType: SourceType;
  result: AnalysisResult;
}): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const slug = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const { error } = await supabase.from("analyses").insert({
    slug,
    source_url: input.sourceUrl,
    source_type: input.sourceType,
    title: input.result.title,
    result: input.result,
  });

  if (error) {
    console.error("Supabase insert failed:", error.message);
    return null;
  }
  return slug;
}

export async function getAnalysisBySlug(slug: string): Promise<StoredAnalysis | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("analyses")
    .select("slug, source_url, source_type, result, created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return {
    slug: data.slug,
    sourceUrl: data.source_url,
    sourceType: data.source_type as SourceType,
    result: data.result as AnalysisResult,
    createdAt: data.created_at,
  };
}
