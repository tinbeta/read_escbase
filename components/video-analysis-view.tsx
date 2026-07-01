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
  Facebook,
  ListChecks,
  ScanSearch,
  Share2,
  ShieldAlert,
  Sparkles,
  Youtube,
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

const platformIconMap = {
  youtube: Youtube,
  tiktok: Sparkles,
  facebook: Facebook,
} satisfies Record<VideoAnalysisResult["platform"], typeof Youtube>;

const overallVerdictLabels = {
  mostly_accurate: "Đa số chính xác",
  mixed: "Đúng sai lẫn nhau",
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

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes === 0) return `${remainingSeconds} giây`;
  return `${minutes} phút${remainingSeconds ? ` ${remainingSeconds} giây` : ""}`;
}

export function VideoAnalysisView({ result, sourceUrl, slug, onAnalyzeAnother }: Props) {
  const [copied, setCopied] = useState(false);
  const PlatformIcon = platformIconMap[result.platform];
  const OverallVerdictIcon = overallVerdictIconMap[result.factCheck.overallVerdict];
  const duration = formatDuration(result.durationSeconds);
  const pullQuote = result.summary.keyQuotes[0];

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
          <span className="video-badge video-badge-platform">
            <PlatformIcon size={13} /> {platformLabels[result.platform]}
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
        <div className={`video-verdict-banner verdict-${result.factCheck.overallVerdict}`}>
          <span className="video-verdict-icon">
            <OverallVerdictIcon size={19} />
          </span>
          <div>
            <strong>{overallVerdictLabels[result.factCheck.overallVerdict]}</strong>
            <p>{result.factCheck.summary}</p>
          </div>
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
