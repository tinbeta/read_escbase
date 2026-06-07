import type { AnalysisResult } from "@/lib/schemas";

export type SourceType = "x" | "web";

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
  sourceType: SourceType;
  sourceUrl: string;
  title: string;
  authorContent: SourceItem[];
  communityContent: SourceItem[];
  linkedPages: LinkedPage[];
};

export type StoredAnalysis = {
  slug: string | null;
  sourceUrl: string;
  sourceType: SourceType;
  createdAt: string;
  tokenCount: number | null;
  result: AnalysisResult;
};

export type AnalysisListItem = {
  slug: string;
  title: string;
  sourceType: SourceType;
  createdAt: string;
  tokenCount: number | null;
};

export type TodayAnalyses = {
  count: number;
  items: AnalysisListItem[];
};

export type QuotaStatus = {
  model: string;
  trackedUsed: number;
  reserved: number;
  usageOffset: number;
  freeDailyLimit: number;
  safetyLimit: number;
  remaining: number;
  percentUsed: number;
  resetAt: string;
  trackingAvailable: boolean;
  scope: "this_app";
};
