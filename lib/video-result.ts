import { stripUnexpectedLanguageArtifacts } from "./language";
import type { VideoAnalysisResult, VideoClaim } from "./video-schemas";

type OverallVerdict = VideoAnalysisResult["factCheck"]["overallVerdict"];

function sanitizeVideoText<T>(value: T, key?: string): T {
  if (typeof value === "string") {
    return (key === "url" ? value : stripUnexpectedLanguageArtifacts(value)) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeVideoText(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeVideoText(entryValue, entryKey),
      ]),
    ) as T;
  }

  return value;
}

export function normalizeVideoOverallVerdict(
  claims: VideoClaim[],
  fallback: OverallVerdict,
): OverallVerdict {
  if (claims.length === 0) return fallback;

  const factualClaims = claims.filter((claim) => claim.verdict !== "opinion");
  if (factualClaims.length === 0) return "opinion_no_factual_claims";

  const hasAccurate = factualClaims.some((claim) => claim.verdict === "accurate");
  const hasWrong = factualClaims.some(
    (claim) => claim.verdict === "inaccurate" || claim.verdict === "misleading",
  );
  const hasNeedsContext = factualClaims.some((claim) => claim.verdict === "needs_context");
  const hasUnverifiable = factualClaims.some((claim) => claim.verdict === "unverifiable");

  if (hasWrong && hasAccurate) return "mixed";
  if (hasWrong) return "mostly_inaccurate";
  if (hasNeedsContext) return "needs_context";
  if (hasUnverifiable) return "unverifiable";
  if (hasAccurate) return "mostly_accurate";

  return fallback;
}

export function normalizeVideoAnalysisResult(result: VideoAnalysisResult): VideoAnalysisResult {
  const cleaned = sanitizeVideoText(result);

  return {
    ...cleaned,
    factCheck: {
      ...cleaned.factCheck,
      overallVerdict: normalizeVideoOverallVerdict(
        cleaned.factCheck.claims,
        cleaned.factCheck.overallVerdict,
      ),
    },
  };
}
