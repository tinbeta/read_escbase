"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Clock3,
  Compass,
  Copy,
  ExternalLink,
  ListChecks,
  ScanSearch,
  Share2,
  ShieldAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import type { VideoAnalysisResult, VideoClaim } from "@/lib/video-schemas";
import { videoAnalysisToText } from "@/lib/format";
import { getAnalysisPath } from "@/lib/share-url";

type Props = {
  result: VideoAnalysisResult;
  sourceUrl: string;
  slug?: string | null;
  onAnalyzeAnother?: () => void;
};

type ClaimVerdict = VideoClaim["verdict"];

const platformLabels = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook Reel",
} as const;

// Official brand glyphs (Simple Icons paths) so each platform badge shows the
// real logo tinted qua currentColor theo màu brand đặt trong CSS.
const platformLogoPaths = {
  youtube:
    "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  tiktok:
    "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
} satisfies Record<VideoAnalysisResult["platform"], string>;

function PlatformLogo({
  platform,
  size = 13,
}: {
  platform: VideoAnalysisResult["platform"];
  size?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d={platformLogoPaths[platform]} />
    </svg>
  );
}

const overallVerdictLabels = {
  mostly_accurate: "Đa số chính xác",
  mixed: "Có đúng có sai",
  mostly_inaccurate: "Đa số không chính xác",
  unverifiable: "Không thể kiểm chứng",
  opinion_no_factual_claims: "Chỉ là ý kiến",
} as const;

const overallVerdictIconMap = {
  mostly_accurate: BadgeCheck,
  mixed: AlertTriangle,
  mostly_inaccurate: ShieldAlert,
  unverifiable: ScanSearch,
  opinion_no_factual_claims: Compass,
} satisfies Record<VideoAnalysisResult["factCheck"]["overallVerdict"], typeof BadgeCheck>;

const claimVerdictLabels = {
  accurate: "Chính xác",
  inaccurate: "Không chính xác",
  misleading: "Gây hiểu sai",
  needs_context: "Cần thêm bối cảnh",
  unverifiable: "Không thể kiểm chứng",
  opinion: "Ý kiến",
} satisfies Record<ClaimVerdict, string>;

const claimVerdictIconMap = {
  accurate: BadgeCheck,
  inaccurate: ShieldAlert,
  misleading: AlertTriangle,
  needs_context: Compass,
  unverifiable: ScanSearch,
  opinion: Compass,
} satisfies Record<ClaimVerdict, typeof BadgeCheck>;

// Quick ✓/✗ index shown in the verdict banner so phone readers can scan
// which points are right or wrong without reading a wall of text.
const claimQuickMarkMap = {
  accurate: { Icon: Check, tone: "good" },
  inaccurate: { Icon: X, tone: "bad" },
  misleading: { Icon: X, tone: "bad" },
  needs_context: { Icon: AlertTriangle, tone: "warn" },
  unverifiable: { Icon: ScanSearch, tone: "neutral" },
  opinion: { Icon: Compass, tone: "neutral" },
} satisfies Record<ClaimVerdict, { Icon: typeof Check; tone: string }>;

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes === 0) return `${remainingSeconds} giây`;
  return `${minutes} phút${remainingSeconds ? ` ${remainingSeconds} giây` : ""}`;
}

export function VideoAnalysisView({ result, sourceUrl, slug, onAnalyzeAnother }: Props) {
  const [copied, setCopied] = useState(false);
  const OverallVerdictIcon = overallVerdictIconMap[result.factCheck.overallVerdict];
  const duration = formatDuration(result.durationSeconds);
  const pullQuote = result.summary.keyQuotes[0];
  // Entertainment/opinion videos get a light note instead of the full
  // fact-check banner + claim cards, since there is nothing to verify.
  const isOpinionOnly =
    result.factCheck.overallVerdict === "opinion_no_factual_claims" &&
    result.factCheck.claims.length === 0;

  async function copyArticle() {
    await navigator.clipboard.writeText(videoAnalysisToText(result, sourceUrl));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareArticle() {
    const shareUrl = slug
      ? `${window.location.origin}${getAnalysisPath(result.title, slug)}`
      : window.location.href;
    const data = { title: result.title, url: shareUrl };
    if (navigator.share) {
      await navigator.share(data);
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <article className="video-result">
      <header className="video-header">
        <div className="video-badges">
          <span className={`video-badge video-badge-platform platform-${result.platform}`}>
            <PlatformLogo platform={result.platform} size={13} /> {platformLabels[result.platform]}
          </span>
          {duration && (
            <span className="video-badge video-badge-duration">
              <Clock3 size={13} /> {duration}
            </span>
          )}
        </div>
        <h1>{result.title}</h1>
        <p className="video-subtitle">{result.subtitle}</p>
        <div className="video-header-actions">
          <button type="button" onClick={copyArticle}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Đã copy" : "Copy bài"}
          </button>
          <a className="video-source-link" href={sourceUrl} target="_blank" rel="noreferrer">
            Xem video gốc <ArrowUpRight size={13} />
          </a>
        </div>
      </header>

      <section className="video-section video-summary-section">
        <p className="video-section-label">
          <ListChecks size={15} /> Tóm tắt nội dung
        </p>
        <p className="video-overview">{result.summary.overview}</p>
        <div className="video-point-list">
          {result.summary.mainPoints.map((point, index) => (
            <div className="video-point" key={`${point.title}-${index}`}>
              <span className="video-point-index">{index + 1}</span>
              <div>
                <strong>{point.title}</strong>
                <p>{point.explanation}</p>
              </div>
            </div>
          ))}
        </div>
        {pullQuote && <blockquote className="video-pull-quote">&ldquo;{pullQuote}&rdquo;</blockquote>}
      </section>

      <section className="video-section">
        <p className="video-section-label">
          <ScanSearch size={15} /> Phân tích đúng sai
        </p>
        {isOpinionOnly ? (
          <div className="video-factcheck-note">
            <Compass size={17} />
            <p>{result.factCheck.summary}</p>
          </div>
        ) : (
          <>
            <div className={`video-verdict-banner verdict-${result.factCheck.overallVerdict}`}>
              <div className="video-verdict-head">
                <span className="video-verdict-icon">
                  <OverallVerdictIcon size={19} />
                </span>
                <strong>{overallVerdictLabels[result.factCheck.overallVerdict]}</strong>
              </div>
              {result.factCheck.claims.length > 0 ? (
                <ul className="video-verdict-points">
                  {result.factCheck.claims.map((claim, index) => {
                    const mark = claimQuickMarkMap[claim.verdict];
                    return (
                      <li key={`${claim.claim}-${index}`}>
                        <span className={`verdict-point-icon tone-${mark.tone}`}>
                          <mark.Icon size={14} strokeWidth={3} />
                        </span>
                        <span>{claim.claim}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>{result.factCheck.summary}</p>
              )}
            </div>

            {result.factCheck.claims.length > 0 ? (
              <div className="video-claim-list">
                {result.factCheck.claims.map((claim, index) => {
                  const ClaimIcon = claimVerdictIconMap[claim.verdict];
                  return (
                    <div className={`video-claim verdict-${claim.verdict}`} key={`${claim.claim}-${index}`}>
                      <span className={`video-claim-verdict verdict-${claim.verdict}`}>
                        <ClaimIcon size={12} />
                        {claimVerdictLabels[claim.verdict]}
                      </span>
                      <p className="video-claim-text">{claim.claim}</p>
                      <p className="video-claim-explanation">{claim.explanation}</p>
                      {claim.sources.length > 0 && (
                        <div className="video-claim-sources">
                          {claim.sources.map((source, sourceIndex) => (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              key={`${source.url}-${sourceIndex}`}
                            >
                              <ExternalLink size={11} />
                              <span>{source.title}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="video-empty-copy">Không có tuyên bố cụ thể nào cần kiểm chứng riêng lẻ.</p>
            )}
          </>
        )}

        {result.factCheck.caveats.length > 0 && (
          <p className="video-caveat-note">{result.factCheck.caveats.join(" ")}</p>
        )}
      </section>

      <p className="ai-disclaimer">
        Đây là bản tóm tắt và phân tích được tạo tự động bằng AI, có thể sai sót và không
        đảm bảo chính xác 100%. Hãy xem video gốc và tự kiểm chứng với nguồn tin cậy trước
        khi tin hoặc chia sẻ.
      </p>

      <div className="video-bottom-actions">
        <button type="button" className="video-share-action" onClick={shareArticle}>
          <Share2 size={16} />
          Chia sẻ
        </button>
        {onAnalyzeAnother ? (
          <button type="button" onClick={onAnalyzeAnother}>
            <ArrowUpRight size={16} />
            Phân tích video khác
          </button>
        ) : (
          <Link href="/">
            <ArrowUpRight size={16} />
            Phân tích video khác
          </Link>
        )}
      </div>
    </article>
  );
}
