import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAllowedUser } from "@/lib/auth";
import { analyzeSource } from "@/lib/analyze";
import { analyzeVideoSource } from "@/lib/video-analyze";
import { analyzeRequestSchema } from "@/lib/schemas";
import { gatherSource } from "@/lib/source";
import { findRecentAnalysis, saveAnalysis } from "@/lib/supabase";
import { normalizeSourceUrl } from "@/lib/url";
import {
  estimateReservation,
  estimateVideoReservation,
  finalizeQuota,
  finalizeVideoQuota,
  getQuotaStatus,
  reserveQuota,
  reserveVideoQuota,
} from "@/lib/quota";

export const runtime = "nodejs";
// Video analysis (download + transcribe + web-search fact-check) is much
// slower than text analysis. Local `next dev`/`next start` are not bound by
// this value; on Vercel, functions longer than the plan's limit still need
// Fluid Compute / a higher plan tier for the video path to fully complete.
export const maxDuration = 300;

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
    await requireAllowedUser(request);

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

    if (source.sourceType === "video") {
      const videoReservation = await reserveVideoQuota(estimateVideoReservation(source.transcript.length));
      let videoTokens = 0;

      try {
        const analyzed = await analyzeVideoSource(source, videoReservation.model);
        videoTokens = analyzed.totalTokens;
        await finalizeVideoQuota(videoReservation, videoTokens, true);

        const slug = await saveAnalysis({
          sourceUrl: source.sourceUrl,
          sourceType: "video",
          result: analyzed.result,
          tokenCount: videoTokens,
        });

        return NextResponse.json({
          slug,
          sourceUrl: source.sourceUrl,
          sourceType: "video",
          createdAt: new Date().toISOString(),
          tokenCount: videoTokens,
          result: analyzed.result,
          cached: false,
          requestTokens: videoTokens,
          quota: await getQuotaStatus(),
        });
      } catch (error) {
        await finalizeVideoQuota(videoReservation, videoTokens, false);
        throw error;
      }
    }

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
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
