import "server-only";

import type { GatheredSource, ModelQuotaStatus, QuotaStatus } from "@/lib/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

// One unified quota system for video analysis across the two real OpenAI free tiers:
//   - gpt-5.4-mini : the large free tier (default 2.5M/day)
//   - gpt-5.4      : the smaller free tier (default 250k/day)
// Video analysis tries gpt-5.4 first (higher quality) and falls back to
// gpt-5.4-mini when the small tier is out.
// Both models share the same `ai_daily_usage` table/RPCs, keyed by the real
// (usage_day, model) pair (see migration 005) — no fake dates needed.

export type ModelId = "gpt-5.4-mini" | "gpt-5.4";
export type VideoModelId = ModelId;

const ALLOWED_FREE_MODELS = new Set(["gpt-5.4-mini"]);
const MAX_OUTPUT_TOKENS = 5_000;
const MAX_VIDEO_OUTPUT_TOKENS = 6_000;

type ModelConfig = {
  model: ModelId;
  freeLimitEnv: string;
  safeLimitEnv: string;
  defaultFreeLimit: number;
  defaultSafeLimit: number;
  supportsUsageOffset: boolean;
};

// Order matters: video reservation tries these top-to-bottom (gpt-5.4 first).
const MODEL_CONFIGS: ModelConfig[] = [
  {
    model: "gpt-5.4",
    freeLimitEnv: "OPENAI_FULL_FREE_DAILY_LIMIT",
    safeLimitEnv: "OPENAI_FULL_FREE_SAFE_LIMIT",
    defaultFreeLimit: 250_000,
    defaultSafeLimit: 230_000,
    supportsUsageOffset: false,
  },
  {
    model: "gpt-5.4-mini",
    freeLimitEnv: "OPENAI_FREE_DAILY_LIMIT",
    safeLimitEnv: "OPENAI_FREE_SAFE_LIMIT",
    defaultFreeLimit: 2_500_000,
    defaultSafeLimit: 2_350_000,
    supportsUsageOffset: true,
  },
];

// Display order for the quota meter. gpt-5.4 is tried first for video, so it
// shows on top.
const DISPLAY_ORDER: ModelId[] = ["gpt-5.4", "gpt-5.4-mini"];

function configFor(model: ModelId): ModelConfig {
  const config = MODEL_CONFIGS.find((item) => item.model === model);
  if (!config) throw new Error(`Không có cấu hình quota cho model ${model}.`);
  return config;
}

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function getFreeModel(): string {
  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  if (!ALLOWED_FREE_MODELS.has(model)) {
    throw new Error(
      `OPENAI_MODEL=${model} không được ứng dụng cho phép. Hãy dùng gpt-5.4-mini để ở trong nhóm quota miễn phí mini.`,
    );
  }
  return model;
}

export function getMaxOutputTokens(): number {
  return MAX_OUTPUT_TOKENS;
}

export function getMaxVideoOutputTokens(): number {
  return MAX_VIDEO_OUTPUT_TOKENS;
}

function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function nextUtcReset(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString();
}

function usageOffsetFor(config: ModelConfig): number {
  if (!config.supportsUsageOffset) return 0;
  return process.env.OPENAI_DAILY_USAGE_OFFSET_DATE === utcDay()
    ? numberFromEnv("OPENAI_DAILY_USAGE_OFFSET", 0)
    : 0;
}

function modelLimits(config: ModelConfig) {
  const freeDailyLimit = numberFromEnv(config.freeLimitEnv, config.defaultFreeLimit);
  const configuredSafeLimit = numberFromEnv(config.safeLimitEnv, config.defaultSafeLimit);
  return { freeDailyLimit, safetyLimit: Math.min(configuredSafeLimit, freeDailyLimit) };
}

export function estimateReservation(source: GatheredSource): number {
  const characters =
    source.title.length +
    source.authorContent.reduce((sum, item) => sum + item.text.length, 0) +
    source.communityContent.reduce((sum, item) => sum + item.text.length, 0) +
    source.linkedPages.reduce((sum, item) => sum + item.title.length + item.text.length, 0);

  // Vietnamese and JSON punctuation can tokenize densely. This intentionally
  // overestimates, then the reservation is reconciled to actual API usage.
  const estimatedInput = Math.ceil(characters / 1.7) + 3_000;
  return Math.min(120_000, Math.max(15_000, estimatedInput + MAX_OUTPUT_TOKENS + 5_000));
}

export function estimateVideoReservation(transcriptCharacters: number): number {
  const estimatedInput = Math.ceil(transcriptCharacters / 1.7) + 4_000;
  // local_web_search returns source snippets/page text to the agent, so video
  // fact-checking still needs a wider token reservation than plain summaries.
  const searchToolOverhead = 25_000;
  return Math.min(
    150_000,
    Math.max(20_000, estimatedInput + MAX_VIDEO_OUTPUT_TOKENS + searchToolOverhead),
  );
}

export type Reservation = {
  day: string;
  model: ModelId;
  tokens: number;
  tracked: boolean;
};

export type VideoReservation = Reservation;

async function reserveForConfigs(configs: ModelConfig[], tokens: number): Promise<Reservation> {
  const supabase = getSupabaseAdminClient();
  const day = utcDay();

  if (!supabase) {
    if (process.env.NODE_ENV === "development") {
      return { day, model: configs[0].model, tokens, tracked: false };
    }
    throw new Error(
      "Quota guard chưa hoạt động. Hãy cấu hình NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SECRET_KEY trước khi dùng production.",
    );
  }

  for (const config of configs) {
    const { safetyLimit } = modelLimits(config);
    const effectiveLimit = Math.max(0, safetyLimit - usageOffsetFor(config));
    const { data, error } = await supabase.rpc("reserve_ai_tokens", {
      p_day: day,
      p_model: config.model,
      p_tokens: tokens,
      p_limit: effectiveLimit,
    });
    if (error) throw new Error(`Không thể kiểm tra quota: ${error.message}`);
    if (data?.allowed) return { day, model: config.model, tokens, tracked: true };
  }

  if (configs.length > 1) {
    throw new Error("Quota miễn phí của GPT-5.4 và GPT-5.4 mini hôm nay đều không đủ.");
  }
  throw new Error("Quota an toàn hôm nay không đủ cho yêu cầu này. Hãy thử lại sau.");
}

export async function reserveQuota(tokens: number): Promise<Reservation> {
  return reserveForConfigs([configFor("gpt-5.4-mini")], tokens);
}

// Video analysis tries gpt-5.4 first, then falls back to gpt-5.4-mini.
export async function reserveVideoQuota(tokens: number): Promise<VideoReservation> {
  return reserveForConfigs(MODEL_CONFIGS, tokens);
}

export async function finalizeQuota(
  reservation: Reservation,
  actualTokens: number,
  success: boolean,
): Promise<void> {
  if (!reservation.tracked) return;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const { error } = await supabase.rpc("finalize_ai_tokens", {
    p_day: reservation.day,
    p_model: reservation.model,
    p_reserved: reservation.tokens,
    p_actual: success ? Math.max(0, actualTokens) : 0,
    p_success: success,
  });
  if (error) console.error("Quota reconciliation failed:", error.message);
}

export async function finalizeVideoQuota(
  reservation: VideoReservation,
  actualTokens: number,
  success: boolean,
): Promise<void> {
  return finalizeQuota(reservation, actualTokens, success);
}

export async function getQuotaStatus(): Promise<QuotaStatus> {
  const supabase = getSupabaseAdminClient();
  const models: ModelQuotaStatus[] = [];
  let trackingAvailable = false;
  const day = utcDay();

  for (const model of DISPLAY_ORDER) {
    const config = configFor(model);
    const { safetyLimit } = modelLimits(config);
    const usageOffset = usageOffsetFor(config);
    let trackedUsed = 0;
    let reserved = 0;

    if (supabase) {
      const { data } = await supabase
        .from("ai_daily_usage")
        .select("used_tokens, reserved_tokens")
        .eq("usage_day", day)
        .eq("model", config.model)
        .maybeSingle();
      trackedUsed = Number(data?.used_tokens ?? 0);
      reserved = Number(data?.reserved_tokens ?? 0);

      // A zero-token probe validates that the atomic quota RPC exists without
      // changing usage counters.
      const { error: rpcError } = await supabase.rpc("reserve_ai_tokens", {
        p_day: day,
        p_model: config.model,
        p_tokens: 0,
        p_limit: safetyLimit,
      });
      if (!rpcError) trackingAvailable = true;
    }

    const counted = trackedUsed + reserved + usageOffset;
    models.push({
      model: config.model,
      trackedUsed: trackedUsed + usageOffset,
      reserved,
      safetyLimit,
      remaining: Math.max(0, safetyLimit - counted),
      percentUsed: Math.min(100, Math.round((counted / Math.max(1, safetyLimit)) * 10_000) / 100),
    });
  }

  return {
    models,
    totalRemaining: models.reduce((sum, item) => sum + item.remaining, 0),
    exhausted: models.every((item) => item.remaining <= 0),
    resetAt: nextUtcReset(),
    trackingAvailable,
    scope: "shared",
  };
}
