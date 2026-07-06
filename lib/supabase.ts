import "server-only";

import { createClient } from "@supabase/supabase-js";
import type {
  AnyAnalysisResult,
  SourceType,
  StoredAnalysis,
  TodayAnalyses,
} from "@/lib/types";

export type AnalysisJobStatus = "queued" | "processing" | "succeeded" | "failed";

export type AnalysisJobRecord = {
  id: string;
  ownerUserId: string;
  sourceUrl: string;
  sourceType: SourceType;
  status: AnalysisJobStatus;
  title: string;
  slug: string | null;
  result: AnyAnalysisResult | null;
  tokenCount: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

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

function mapAnalysisRow(data: {
  slug: string | null;
  source_url: string;
  source_type: string;
  result: unknown;
  created_at: string;
  token_count?: number | null;
}): StoredAnalysis {
  return {
    slug: data.slug,
    sourceUrl: data.source_url,
    sourceType: data.source_type as SourceType,
    result: data.result as AnyAnalysisResult,
    createdAt: data.created_at,
    tokenCount: Number(data.token_count ?? 0) || null,
  };
}

function mapJobRow(data: {
  id: string;
  owner_user_id: string;
  source_url: string;
  source_type: string;
  status: string;
  title: string;
  slug: string | null;
  result: unknown | null;
  token_count: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}): AnalysisJobRecord {
  return {
    id: data.id,
    ownerUserId: data.owner_user_id,
    sourceUrl: data.source_url,
    sourceType: data.source_type as SourceType,
    status: data.status as AnalysisJobStatus,
    title: data.title,
    slug: data.slug,
    result: data.result as AnyAnalysisResult | null,
    tokenCount: Number(data.token_count ?? 0) || null,
    error: data.error,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    startedAt: data.started_at,
    completedAt: data.completed_at,
  };
}

export async function findRecentAnalysis(
  sourceUrl: string,
  ownerUserId: string,
): Promise<StoredAnalysis | null> {
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
    .eq("owner_user_id", ownerUserId)
    .eq("source_url", sourceUrl)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isMissingTokenCountColumn(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("analyses")
      .select("slug, source_url, source_type, result, created_at")
      .eq("owner_user_id", ownerUserId)
      .eq("source_url", sourceUrl)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackError || !fallbackData) return null;
    return mapAnalysisRow(fallbackData);
  }

  if (error || !data) return null;
  return mapAnalysisRow(data);
}

export async function saveAnalysis(input: {
  ownerUserId: string;
  sourceUrl: string;
  sourceType: SourceType;
  result: AnyAnalysisResult;
  tokenCount: number;
}): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const slug = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const payload = {
    slug,
    owner_user_id: input.ownerUserId,
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
      owner_user_id: payload.owner_user_id,
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

export async function createAnalysisJob(input: {
  ownerUserId: string;
  sourceUrl: string;
  sourceType: SourceType;
}): Promise<AnalysisJobRecord | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("analysis_jobs")
    .insert({
      owner_user_id: input.ownerUserId,
      source_url: input.sourceUrl,
      source_type: input.sourceType,
      status: "queued",
      title: input.sourceType === "video" ? "Đang phân tích video..." : "Đang phân tích bài viết...",
    })
    .select(
      "id, owner_user_id, source_url, source_type, status, title, slug, result, token_count, error, created_at, updated_at, started_at, completed_at",
    )
    .single();

  if (error || !data) {
    if (error) console.error("Supabase analysis job insert failed:", error.message);
    return null;
  }
  return mapJobRow(data);
}

export async function getAnalysisJob(jobId: string): Promise<AnalysisJobRecord | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("analysis_jobs")
    .select(
      "id, owner_user_id, source_url, source_type, status, title, slug, result, token_count, error, created_at, updated_at, started_at, completed_at",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) return null;
  return mapJobRow(data);
}

export async function getAnalysisJobForOwner(
  jobId: string,
  ownerUserId: string,
): Promise<AnalysisJobRecord | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("analysis_jobs")
    .select(
      "id, owner_user_id, source_url, source_type, status, title, slug, result, token_count, error, created_at, updated_at, started_at, completed_at",
    )
    .eq("id", jobId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (error || !data) return null;
  return mapJobRow(data);
}

export async function updateAnalysisJob(
  jobId: string,
  input: Partial<{
    sourceUrl: string;
    sourceType: SourceType;
    status: AnalysisJobStatus;
    title: string;
    slug: string | null;
    result: AnyAnalysisResult | null;
    tokenCount: number | null;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.sourceUrl !== undefined) payload.source_url = input.sourceUrl;
  if (input.sourceType !== undefined) payload.source_type = input.sourceType;
  if (input.status !== undefined) payload.status = input.status;
  if (input.title !== undefined) payload.title = input.title;
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.result !== undefined) payload.result = input.result;
  if (input.tokenCount !== undefined) payload.token_count = input.tokenCount;
  if (input.error !== undefined) payload.error = input.error;
  if (input.startedAt !== undefined) payload.started_at = input.startedAt;
  if (input.completedAt !== undefined) payload.completed_at = input.completedAt;

  const { error } = await supabase.from("analysis_jobs").update(payload).eq("id", jobId);
  if (error) console.error("Supabase analysis job update failed:", error.message);
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
      result: fallbackData.result as AnyAnalysisResult,
      createdAt: fallbackData.created_at,
      tokenCount: null,
    };
  }

  if (error || !data) return null;
  return {
    slug: data.slug,
    sourceUrl: data.source_url,
    sourceType: data.source_type as SourceType,
    result: data.result as AnyAnalysisResult,
    createdAt: data.created_at,
    tokenCount: Number(data.token_count ?? 0) || null,
  };
}

export async function getTodayAnalysesPage(
  ownerUserId: string | null,
  page = 1,
  pageSize = 10,
): Promise<TodayAnalyses> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { count: 0, items: [] };
  if (!ownerUserId) return { count: 0, items: [] };

  const { start, end } = getVietnamDayBounds();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 50) : 10;
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  const { data, error, count } = await supabase
    .from("analyses")
    .select("slug, title, source_type, created_at, token_count", { count: "exact" })
    .eq("owner_user_id", ownerUserId)
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false })
    .range(0, to);

  const { data: jobData, error: jobError, count: jobCount } = await supabase
    .from("analysis_jobs")
    .select("id, title, source_type, status, created_at, token_count, error", { count: "exact" })
    .eq("owner_user_id", ownerUserId)
    .neq("status", "succeeded")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false })
    .range(0, to);

  if (isMissingTokenCountColumn(error)) {
    const { data: fallbackData, error: fallbackError, count: fallbackCount } = await supabase
      .from("analyses")
      .select("slug, title, source_type, created_at", { count: "exact" })
      .eq("owner_user_id", ownerUserId)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false })
      .range(0, to);

    if (fallbackError || !fallbackData) {
      if (fallbackError) console.error("Supabase daily analyses query failed:", fallbackError.message);
      return { count: 0, items: [] };
    }

    const completedItems = fallbackData.map((item) => ({
      id: item.slug,
      slug: item.slug,
      title: item.title,
      sourceType: item.source_type as SourceType,
      createdAt: item.created_at,
      tokenCount: null,
      status: "succeeded" as const,
      error: null,
    }));
    const jobItems = (jobData || []).map((item) => ({
      id: item.id,
      slug: null,
      title: item.title,
      sourceType: item.source_type as SourceType,
      createdAt: item.created_at,
      tokenCount: Number(item.token_count ?? 0) || null,
      status: item.status as "queued" | "processing" | "failed",
      error: item.error ?? null,
    }));
    const items = [...completedItems, ...jobItems]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(from, to + 1);

    return {
      count: (fallbackCount ?? fallbackData.length) + (jobCount ?? jobData?.length ?? 0),
      items,
    };
  }

  if (error || !data) {
    if (error) console.error("Supabase daily analyses query failed:", error.message);
    return { count: 0, items: [] };
  }
  if (jobError) console.error("Supabase daily analysis jobs query failed:", jobError.message);

  const completedItems = data.map((item) => ({
    id: item.slug,
    slug: item.slug,
    title: item.title,
    sourceType: item.source_type as SourceType,
    createdAt: item.created_at,
    tokenCount: Number(item.token_count ?? 0) || null,
    status: "succeeded" as const,
    error: null,
  }));
  const jobItems = (jobData || []).map((item) => ({
    id: item.id,
    slug: null,
    title: item.title,
    sourceType: item.source_type as SourceType,
    createdAt: item.created_at,
    tokenCount: Number(item.token_count ?? 0) || null,
    status: item.status as "queued" | "processing" | "failed",
    error: item.error ?? null,
  }));
  const items = [...completedItems, ...jobItems]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(from, to + 1);

  return {
    count: (count ?? data.length) + (jobCount ?? jobData?.length ?? 0),
    items,
  };
}

export async function getTodayAnalyses(ownerUserId: string | null, limit = 10): Promise<TodayAnalyses> {
  return getTodayAnalysesPage(ownerUserId, 1, limit);
}
