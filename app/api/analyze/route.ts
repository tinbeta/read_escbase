import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureAnalysisJobRunning } from "@/lib/analysis-jobs";
import { AuthError, requireAllowedUser } from "@/lib/auth";
import { analyzeRequestSchema } from "@/lib/schemas";
import { createAnalysisJob, findRecentAnalysis } from "@/lib/supabase";
import { normalizeSourceUrl } from "@/lib/url";
import { detectVideoPlatform } from "@/lib/video-platform";
import { getQuotaStatus } from "@/lib/quota";

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
    const { user } = await requireAllowedUser(request);

    const body: unknown = await request.json();
    const parsed = analyzeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ." },
        { status: 400 },
      );
    }

    const normalizedUrl = normalizeSourceUrl(parsed.data.url);
    if (!detectVideoPlatform(normalizedUrl)) {
      return NextResponse.json(
        { error: "Fast Escbase hiện chỉ hỗ trợ video TikTok, YouTube Shorts và Facebook Reel/video." },
        { status: 400 },
      );
    }

    const cached = await findRecentAnalysis(normalizedUrl, user.id);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true, quota: await getQuotaStatus() });
    }

    if (isRateLimited(request)) {
      return NextResponse.json(
        { error: "Bạn đã gửi quá nhiều yêu cầu mới. Hãy thử lại sau." },
        { status: 429 },
      );
    }

    const job = await createAnalysisJob({
      ownerUserId: user.id,
      sourceUrl: normalizedUrl,
      sourceType: "video",
    });
    if (!job) {
      return NextResponse.json(
        { error: "Không tạo được job phân tích video. Hãy kiểm tra migration Supabase." },
        { status: 500 },
      );
    }

    ensureAnalysisJobRunning(job.id);

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        sourceUrl: job.sourceUrl,
        sourceType: job.sourceType,
        createdAt: job.createdAt,
        queued: true,
        message: "Bài viết đã được thêm vào thư viện. Bạn có thể chờ xem kết quả hoặc quay lại sau.",
        quota: await getQuotaStatus(),
      },
      { status: 202 },
    );
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
