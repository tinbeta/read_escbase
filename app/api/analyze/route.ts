import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { analyzeSource } from "@/lib/analyze";
import { analyzeRequestSchema } from "@/lib/schemas";
import { gatherSource } from "@/lib/source";
import { findRecentAnalysis, saveAnalysis } from "@/lib/supabase";
import { normalizeSourceUrl } from "@/lib/url";
import {
  estimateReservation,
  finalizeQuota,
  getQuotaStatus,
  reserveQuota,
} from "@/lib/quota";

export const runtime = "nodejs";
export const maxDuration = 60;

const attempts = new Map<string, number[]>();

function requestKey(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const salt = process.env.RATE_LIMIT_SALT || "local-dev";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function isRateLimited(request: NextRequest): boolean {
  const key = requestKey(request);
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < 60 * 60 * 1000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > 10;
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = analyzeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ." },
        { status: 400 },
      );
    }

    const normalizedUrl = normalizeSourceUrl(parsed.data.url);
    const cached = await findRecentAnalysis(normalizedUrl);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true, quota: await getQuotaStatus() });
    }

    if (isRateLimited(request)) {
      return NextResponse.json(
        { error: "Bạn đã gửi quá nhiều yêu cầu mới. Hãy thử lại sau." },
        { status: 429 },
      );
    }

    const source = await gatherSource(normalizedUrl);
    const reservation = await reserveQuota(estimateReservation(source));
    let totalTokens = 0;

    try {
      const analyzed = await analyzeSource(source);
      totalTokens = analyzed.totalTokens;
      await finalizeQuota(reservation, totalTokens, true);

      const slug = await saveAnalysis({
        sourceUrl: source.sourceUrl,
        sourceType: source.sourceType,
        result: analyzed.result,
        tokenCount: totalTokens,
      });

      return NextResponse.json({
        slug,
        sourceUrl: source.sourceUrl,
        sourceType: source.sourceType,
        createdAt: new Date().toISOString(),
        tokenCount: totalTokens,
        result: analyzed.result,
        cached: false,
        requestTokens: totalTokens,
        quota: await getQuotaStatus(),
      });
    } catch (error) {
      await finalizeQuota(reservation, totalTokens, false);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể phân tích đường dẫn.";
    console.error("Analyze request failed:", message);
    let quota = null;
    try {
      quota = await getQuotaStatus();
    } catch {
      // Preserve the original error when quota status is unavailable.
    }
    return NextResponse.json({ error: message, quota }, { status: 500 });
  }
}
