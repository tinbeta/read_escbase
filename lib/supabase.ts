import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { AnalysisResult } from "@/lib/schemas";
import type {
  SourceType,
  StoredAnalysis,
  TodayAnalyses,
} from "@/lib/types";

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function isMissingTokenCountColumn(error: { message?: string; code?: string } | null) {
  return Boolean(
    error &&
      (error.code === "PGRST204" ||
        error.message?.includes("token_count") ||
        error.message?.includes("schema cache")),
  );
}

function getVietnamDayBounds(now = new Date()) {
  const vietnamNow = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
  const startUtc =
    Date.UTC(
      vietnamNow.getUTCFullYear(),
      vietnamNow.getUTCMonth(),
      vietnamNow.getUTCDate(),
    ) - VIETNAM_UTC_OFFSET_MS;

  return {
    start: new Date(startUtc).toISOString(),
    end: new Date(startUtc + 24 * 60 * 60 * 1000).toISOString(),
  };
}

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
    .select("slug, source_url, source_type, result, created_at, token_count")
    .eq("source_url", sourceUrl)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isMissingTokenCountColumn(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("analyses")
      .select("slug, source_url, source_type, result, created_at")
      .eq("source_url", sourceUrl)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackError || !fallbackData) return null;
    return {
      slug: fallbackData.slug,
      sourceUrl: fallbackData.source_url,
      sourceType: fallbackData.source_type as SourceType,
      result: fallbackData.result as AnalysisResult,
      createdAt: fallbackData.created_at,
      tokenCount: null,
    };
  }

  if (error || !data) return null;
  return {
    slug: data.slug,
    sourceUrl: data.source_url,
    sourceType: data.source_type as SourceType,
    result: data.result as AnalysisResult,
    createdAt: data.created_at,
    tokenCount: Number(data.token_count ?? 0) || null,
  };
}

export async function saveAnalysis(input: {
  sourceUrl: string;
  sourceType: SourceType;
  result: AnalysisResult;
  tokenCount: number;
}): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const slug = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const payload = {
    slug,
    source_url: input.sourceUrl,
    source_type: input.sourceType,
    title: input.result.title,
    result: input.result,
    token_count: input.tokenCount,
  };
  const { error } = await supabase.from("analyses").insert(payload);

  if (isMissingTokenCountColumn(error)) {
    const fallbackPayload = {
      slug: payload.slug,
      source_url: payload.source_url,
      source_type: payload.source_type,
      title: payload.title,
      result: payload.result,
    };
    const { error: fallbackError } = await supabase.from("analyses").insert(fallbackPayload);
    if (fallbackError) {
      console.error("Supabase insert failed:", fallbackError.message);
      return null;
    }
    return slug;
  }

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
    .select("slug, source_url, source_type, result, created_at, token_count")
    .eq("slug", slug)
    .maybeSingle();

  if (isMissingTokenCountColumn(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("analyses")
      .select("slug, source_url, source_type, result, created_at")
      .eq("slug", slug)
      .maybeSingle();

    if (fallbackError || !fallbackData) return null;
    return {
      slug: fallbackData.slug,
      sourceUrl: fallbackData.source_url,
      sourceType: fallbackData.source_type as SourceType,
      result: fallbackData.result as AnalysisResult,
      createdAt: fallbackData.created_at,
      tokenCount: null,
    };
  }

  if (error || !data) return null;
  return {
    slug: data.slug,
    sourceUrl: data.source_url,
    sourceType: data.source_type as SourceType,
    result: data.result as AnalysisResult,
    createdAt: data.created_at,
    tokenCount: Number(data.token_count ?? 0) || null,
  };
}

export async function getTodayAnalyses(limit = 10): Promise<TodayAnalyses> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { count: 0, items: [] };

  const { start, end } = getVietnamDayBounds();
  const { data, error, count } = await supabase
    .from("analyses")
    .select("slug, title, source_type, created_at, token_count", { count: "exact" })
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (isMissingTokenCountColumn(error)) {
    const { data: fallbackData, error: fallbackError, count: fallbackCount } = await supabase
      .from("analyses")
      .select("slug, title, source_type, created_at", { count: "exact" })
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (fallbackError || !fallbackData) {
      if (fallbackError) console.error("Supabase daily analyses query failed:", fallbackError.message);
      return { count: 0, items: [] };
    }

    return {
      count: fallbackCount ?? fallbackData.length,
      items: fallbackData.map((item) => ({
        slug: item.slug,
        title: item.title,
        sourceType: item.source_type as SourceType,
        createdAt: item.created_at,
        tokenCount: null,
      })),
    };
  }

  if (error || !data) {
    if (error) console.error("Supabase daily analyses query failed:", error.message);
    return { count: 0, items: [] };
  }

  return {
    count: count ?? data.length,
    items: data.map((item) => ({
      slug: item.slug,
      title: item.title,
      sourceType: item.source_type as SourceType,
      createdAt: item.created_at,
      tokenCount: Number(item.token_count ?? 0) || null,
    })),
  };
}
