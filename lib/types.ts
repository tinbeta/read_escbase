import type { AnalysisResult } from "@/lib/schemas";
import type { VideoAnalysisResult } from "@/lib/video-schemas";

export type SourceType = "x" | "web" | "video";

export type VideoPlatform = "youtube" | "tiktok" | "facebook";

export type SourceItem = {
  author?: string;
  text: string;
  createdAt?: string;
  url?: string;
  likes?: number;
  replies?: number;
};

export type LinkedPage = {
  url: string;
  title: string;
  text: string;
};

export type GatheredSource = {
  sourceType: "x" | "web";
  sourceUrl: string;
  title: string;
  authorContent: SourceItem[];
  communityContent: SourceItem[];
  linkedPages: LinkedPage[];
};

export type VideoSegment = {
  start: number;
  end: number;
  text: string;
};

export type GatheredVideoSource = {
  sourceType: "video";
  sourceUrl: string;
  platform: VideoPlatform;
  videoId: string | null;
  title: string;
  description: string;
  uploader: string | null;
  durationSeconds: number | null;
  transcript: string;
  transcriptSegments: VideoSegment[];
  language: string | null;
};

export type AnyGatheredSource = GatheredSource | GatheredVideoSource;

export type AnyAnalysisResult = AnalysisResult | VideoAnalysisResult;

export type StoredAnalysis = {
  slug: string | null;
  sourceUrl: string;
  sourceType: SourceType;
  createdAt: string;
  tokenCount: number | null;
  result: AnyAnalysisResult;
};

export type AnalysisListItem = {
  id: string;
  slug: string | null;
  title: string;
  sourceType: SourceType;
  createdAt: string;
  tokenCount: number | null;
  status: "succeeded" | "queued" | "processing" | "failed";
  error: string | null;
};

export type TodayAnalyses = {
  count: number;
  items: AnalysisListItem[];
};

export type ModelQuotaStatus = {
  model: "gpt-5.4" | "gpt-5.4-mini";
  trackedUsed: number;
  reserved: number;
  safetyLimit: number;
  remaining: number;
  percentUsed: number;
};

export type QuotaStatus = {
  models: ModelQuotaStatus[];
  totalRemaining: number;
  exhausted: boolean;
  resetAt: string;
  trackingAvailable: boolean;
  scope: "this_app" | "shared";
};
