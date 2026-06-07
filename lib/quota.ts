import "server-only";

import type { GatheredSource, QuotaStatus } from "@/lib/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

const ALLOWED_FREE_MODELS = new Set(["gpt-5.4-mini"]);
const DEFAULT_DAILY_LIMIT = 2_500_000;
const DEFAULT_SAFE_LIMIT = 2_350_000;
const MAX_OUTPUT_TOKENS = 5_000;

type Reservation = {
  day: string;
  tokens: number;
  tracked: boolean;
};

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

function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function nextUtcReset(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString();
}

function limits() {
  const freeDailyLimit = numberFromEnv("OPENAI_FREE_DAILY_LIMIT", DEFAULT_DAILY_LIMIT);
  const configuredSafeLimit = numberFromEnv("OPENAI_FREE_SAFE_LIMIT", DEFAULT_SAFE_LIMIT);
  const safetyLimit = Math.min(configuredSafeLimit, freeDailyLimit);
  const usageOffset =
    process.env.OPENAI_DAILY_USAGE_OFFSET_DATE === utcDay()
      ? numberFromEnv("OPENAI_DAILY_USAGE_OFFSET", 0)
      : 0;
  return { freeDailyLimit, safetyLimit, usageOffset };
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

export async function getQuotaStatus(): Promise<QuotaStatus> {
  const supabase = getSupabaseAdminClient();
  const { freeDailyLimit, safetyLimit, usageOffset } = limits();
  let trackedUsed = 0;
  let reserved = 0;
  let trackingAvailable = false;

  if (supabase) {
    const { data } = await supabase
      .from("ai_daily_usage")
      .select("used_tokens, reserved_tokens")
      .eq("usage_day", utcDay())
      .maybeSingle();
    trackedUsed = Number(data?.used_tokens ?? 0);
    reserved = Number(data?.reserved_tokens ?? 0);

    // A zero-token probe validates that the atomic quota RPC exists without
    // changing usage counters.
    const { error: rpcError } = await supabase.rpc("reserve_ai_tokens", {
      p_day: utcDay(),
      p_tokens: 0,
      p_limit: safetyLimit,
    });
    trackingAvailable = !rpcError;
  }

  const counted = trackedUsed + reserved + usageOffset;
  return {
    model: getFreeModel(),
    trackedUsed,
    reserved,
    usageOffset,
    freeDailyLimit,
    safetyLimit,
    remaining: Math.max(0, safetyLimit - counted),
    percentUsed: Math.min(100, Math.round((counted / Math.max(1, safetyLimit)) * 10_000) / 100),
    resetAt: nextUtcReset(),
    trackingAvailable,
    scope: "this_app",
  };
}

export async function reserveQuota(tokens: number): Promise<Reservation> {
  const supabase = getSupabaseAdminClient();
  const { safetyLimit, usageOffset } = limits();
  const effectiveLimit = Math.max(0, safetyLimit - usageOffset);

  if (!supabase) {
    if (process.env.NODE_ENV === "development") {
      return { day: utcDay(), tokens, tracked: false };
    }
    throw new Error(
      "Quota guard chưa hoạt động. Hãy cấu hình NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SECRET_KEY trước khi dùng production.",
    );
  }

  const { data, error } = await supabase.rpc("reserve_ai_tokens", {
    p_day: utcDay(),
    p_tokens: tokens,
    p_limit: effectiveLimit,
  });

  if (error) throw new Error(`Không thể kiểm tra quota: ${error.message}`);
  if (!data?.allowed) {
    throw new Error(
      `Quota an toàn hôm nay không đủ cho yêu cầu này. Còn khoảng ${Number(data?.remaining ?? 0).toLocaleString("vi-VN")} token.`,
    );
  }

  return { day: utcDay(), tokens, tracked: true };
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
    p_reserved: reservation.tokens,
    p_actual: success ? Math.max(0, actualTokens) : 0,
    p_success: success,
  });
  if (error) console.error("Quota reconciliation failed:", error.message);
}
