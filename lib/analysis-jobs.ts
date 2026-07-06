import "server-only";

import { analyzeSource } from "@/lib/analyze";
import { analyzeVideoSource } from "@/lib/video-analyze";
import { gatherSource } from "@/lib/source";
import {
  estimateReservation,
  estimateVideoReservation,
  finalizeQuota,
  finalizeVideoQuota,
  reserveQuota,
  reserveVideoQuota,
} from "@/lib/quota";
import {
  findRecentAnalysis,
  getAnalysisJob,
  saveAnalysis,
  updateAnalysisJob,
} from "@/lib/supabase";

const activeJobs = new Map<string, Promise<void>>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Không thể phân tích đường dẫn.";
}

async function completeFromCache(jobId: string, cached: Awaited<ReturnType<typeof findRecentAnalysis>>) {
  if (!cached) return false;
  await updateAnalysisJob(jobId, {
    status: "succeeded",
    title: cached.result.title,
    slug: cached.slug,
    result: cached.result,
    tokenCount: cached.tokenCount,
    completedAt: new Date().toISOString(),
    error: null,
  });
  return true;
}

async function runAnalysisJob(jobId: string): Promise<void> {
  const job = await getAnalysisJob(jobId);
  if (!job || job.status === "succeeded") return;

  const startedAt = new Date().toISOString();
  await updateAnalysisJob(job.id, {
    status: "processing",
    startedAt: job.startedAt || startedAt,
    error: null,
  });

  try {
    const cachedBeforeGather = await findRecentAnalysis(job.sourceUrl, job.ownerUserId);
    if (await completeFromCache(job.id, cachedBeforeGather)) return;

    const source = await gatherSource(job.sourceUrl);
    await updateAnalysisJob(job.id, {
      sourceUrl: source.sourceUrl,
      sourceType: source.sourceType,
      title: source.title || job.title,
    });

    const cachedAfterGather = await findRecentAnalysis(source.sourceUrl, job.ownerUserId);
    if (await completeFromCache(job.id, cachedAfterGather)) return;

    if (source.sourceType === "video") {
      const reservation = await reserveVideoQuota(
        estimateVideoReservation(source.transcript.length, source.visualContactSheet?.frameCount ?? 0),
      );
      let videoTokens = 0;

      try {
        const analyzed = await analyzeVideoSource(source, reservation.model);
        videoTokens = analyzed.totalTokens;
        await finalizeVideoQuota(reservation, videoTokens, true);

        const slug = await saveAnalysis({
          ownerUserId: job.ownerUserId,
          sourceUrl: source.sourceUrl,
          sourceType: "video",
          result: analyzed.result,
          tokenCount: videoTokens,
        });
        if (!slug) throw new Error("Không lưu được bài phân tích vào thư viện.");

        await updateAnalysisJob(job.id, {
          status: "succeeded",
          title: analyzed.result.title,
          slug,
          result: analyzed.result,
          tokenCount: videoTokens,
          completedAt: new Date().toISOString(),
          error: null,
        });
      } catch (error) {
        await finalizeVideoQuota(reservation, videoTokens, false);
        throw error;
      }
      return;
    }

    const reservation = await reserveQuota(estimateReservation(source));
    let totalTokens = 0;

    try {
      const analyzed = await analyzeSource(source);
      totalTokens = analyzed.totalTokens;
      await finalizeQuota(reservation, totalTokens, true);

      const slug = await saveAnalysis({
        ownerUserId: job.ownerUserId,
        sourceUrl: source.sourceUrl,
        sourceType: source.sourceType,
        result: analyzed.result,
        tokenCount: totalTokens,
      });
      if (!slug) throw new Error("Không lưu được bài phân tích vào thư viện.");

      await updateAnalysisJob(job.id, {
        status: "succeeded",
        title: analyzed.result.title,
        slug,
        result: analyzed.result,
        tokenCount: totalTokens,
        completedAt: new Date().toISOString(),
        error: null,
      });
    } catch (error) {
      await finalizeQuota(reservation, totalTokens, false);
      throw error;
    }
  } catch (error) {
    const message = errorMessage(error);
    console.error("Analysis job failed:", message);
    await updateAnalysisJob(job.id, {
      status: "failed",
      error: message,
      completedAt: new Date().toISOString(),
    });
  }
}

export function ensureAnalysisJobRunning(jobId: string): void {
  if (activeJobs.has(jobId)) return;

  const promise = runAnalysisJob(jobId).finally(() => {
    activeJobs.delete(jobId);
  });
  activeJobs.set(jobId, promise);
}
