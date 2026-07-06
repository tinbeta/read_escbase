import { NextRequest, NextResponse } from "next/server";
import { ensureAnalysisJobRunning } from "@/lib/analysis-jobs";
import { AuthError, requireAllowedUser } from "@/lib/auth";
import { getQuotaStatus } from "@/lib/quota";
import { getAnalysisJobForOwner } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_PROCESSING_MS = 30 * 60 * 1000;

type Params = {
  params: Promise<{ jobId: string }>;
};

function shouldRestartJob(status: string, updatedAt: string): boolean {
  if (status === "queued") return true;
  if (status !== "processing") return false;
  return Date.now() - Date.parse(updatedAt) > STALE_PROCESSING_MS;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { user } = await requireAllowedUser(request);
    const { jobId } = await params;
    const job = await getAnalysisJobForOwner(jobId, user.id);

    if (!job) {
      return NextResponse.json({ error: "Không tìm thấy job phân tích." }, { status: 404 });
    }

    if (shouldRestartJob(job.status, job.updatedAt)) {
      ensureAnalysisJobRunning(job.id);
    }

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        sourceUrl: job.sourceUrl,
        sourceType: job.sourceType,
        createdAt: job.completedAt || job.createdAt,
        title: job.title,
        slug: job.slug,
        result: job.result,
        tokenCount: job.tokenCount,
        requestTokens: job.tokenCount,
        error: job.error,
        quota: await getQuotaStatus(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Không thể đọc trạng thái job.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
