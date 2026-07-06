"use client";

import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Check,
  Clock3,
  Compass,
  Copy,
  ExternalLink,
  Layers3,
  Leaf,
  Link2,
  Lightbulb,
  MessageCircleMore,
  PenLine,
  Quote,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import type { AnalysisResult } from "@/lib/schemas";
import { getAnalysisPath } from "@/lib/share-url";

type Props = {
  result: AnalysisResult;
  sourceUrl: string;
  slug?: string | null;
  createdAt?: string | null;
  tokenCount?: number | null;
  onAnalyzeAnother?: () => void;
};

type EvidenceType = AnalysisResult["mainPoints"][number]["evidence"];
type DeepDiveKind = "takeaway" | "caveat" | "source" | "timeline";

const evidenceLabels = {
  author_claim: "Tác giả nêu",
  supported_by_link: "Có link hỗ trợ",
  context: "Bối cảnh",
};

const sentimentLabels = {
  positive: "Tích cực",
  negative: "Tiêu cực",
  mixed: "Trái chiều",
  neutral: "Trung lập",
  unavailable: "Không có dữ liệu",
};

const evidenceIconMap = {
  author_claim: PenLine,
  supported_by_link: Link2,
  context: Compass,
} satisfies Record<EvidenceType, typeof PenLine>;

const pointLeadIcons = [Lightbulb, Sparkles, BadgeCheck, Leaf, Layers3, Compass];

const deepDiveIconMap = {
  takeaway: BadgeCheck,
  caveat: ShieldAlert,
  source: ExternalLink,
  timeline: Clock3,
} satisfies Record<DeepDiveKind, typeof BadgeCheck>;

function getShortLead(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 86) return normalized;
  const sentence = normalized.match(/^.{28,86}?[.!?。]|^.{28,86}?(?=,|;|:)/u)?.[0];
  if (sentence) return sentence.replace(/[.!?。,:;]+$/u, "");
  return `${normalized.slice(0, 82).trim()}...`;
}

function formatTokenCount(value?: number | null) {
  if (!value) return "Chưa lưu token";
  return `${new Intl.NumberFormat("vi-VN").format(value)} token`;
}

function formatCreatedAt(value?: string | null) {
  if (!value) return "Chưa lưu giờ tạo";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function buildDeepDiveItems(result: AnalysisResult) {
  const items: Array<{ kind: DeepDiveKind; title: string; body?: string }> = [];

  if (result.takeaway) {
    items.push({ kind: "takeaway", title: "Kết luận cần nhớ", body: result.takeaway });
  }

  for (const caveat of result.caveats.slice(0, 4)) {
    const title = getShortLead(caveat);
    items.push({
      kind: "caveat",
      title,
      body: title === caveat ? undefined : caveat,
    });
  }

  for (const source of result.linkedSources.slice(0, 3)) {
    items.push({
      kind: "source",
      title: source.title,
      body: `${source.contribution} Hỗ trợ: ${source.supports}`,
    });
  }

  for (const item of result.timeline.slice(0, 3)) {
    items.push({
      kind: "timeline",
      title: item.time,
      body: item.event,
    });
  }

  return items;
}

export function AnalysisView({ result, sourceUrl, slug, createdAt, tokenCount, onAnalyzeAnother }: Props) {
  const [linkCopied, setLinkCopied] = useState(false);
  const deepDiveItems = buildDeepDiveItems(result);
  const evidenceTypes = Array.from(new Set(result.mainPoints.map((point) => point.evidence)));

  async function copyArticleLink() {
    const shareUrl = slug
      ? `${window.location.origin}${getAnalysisPath(result.title, slug)}`
      : window.location.href;
    await navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1800);
  }

  return (
    <article className="result-shell">
      <header className="article-header">
        <h1>{result.title}</h1>
        <p className="article-subtitle">{result.subtitle}</p>
        <div className="article-meta">
          <span>
            <Clock3 size={15} /> {result.readingMinutes} phút đọc
          </span>
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            Mở nguồn gốc <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="article-actions">
          <span><Sparkles size={15} /> {formatTokenCount(tokenCount)}</span>
          <span><Clock3 size={15} /> {formatCreatedAt(createdAt)}</span>
        </div>
      </header>

      <section className="lead-card">
        <div className="section-icon"><BookOpen size={20} /></div>
        <div>
          <p className="eyebrow">Đọc nhanh</p>
          <h2>Tóm tắt nội dung</h2>
          <p>{result.overview}</p>
        </div>
      </section>

      <section className="article-section">
        <div className="section-heading">
          <Quote size={20} />
          <div>
            <p className="eyebrow">Ý chính rút ra</p>
            <h2>Bài học chính</h2>
          </div>
        </div>
        <div className="evidence-legend" aria-label="Chú thích bằng chứng">
          {evidenceTypes.map((evidence) => {
            const EvidenceIcon = evidenceIconMap[evidence];
            return (
              <span className={`evidence evidence-${evidence}`} key={evidence}>
                <EvidenceIcon size={13} />
                {evidenceLabels[evidence]}
              </span>
            );
          })}
        </div>
        <div className="point-list">
          {result.mainPoints.map((point, index) => {
            const LeadIcon = pointLeadIcons[index % pointLeadIcons.length];

            return (
              <div className={`point-card point-tone-${index % 6}`} key={`${point.title}-${index}`}>
                <div className="idea-lead" aria-label={`Ý ${index + 1}: ${evidenceLabels[point.evidence]}`}>
                  <span><LeadIcon size={19} /></span>
                  <strong>{String(index + 1).padStart(2, "0")}</strong>
                </div>
                <h3>{point.title}</h3>
                <p>{point.explanation}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="article-section community-section">
        <div className="section-heading">
          <MessageCircleMore size={21} />
          <div>
            <p className="eyebrow">Bình luận, không phải dữ kiện</p>
            <h2>Phản ứng cộng đồng</h2>
          </div>
          <span className="sentiment">{sentimentLabels[result.community.sentiment]}</span>
        </div>
        {result.community.available ? (
          <>
            <p className="community-summary">{result.community.summary}</p>
            <div className="community-list">
              {result.community.highlights.map((item, index) => (
                <div className={`community-card community-tone-${index % 6}`} key={`${item.author}-${index}`}>
                  <span className={`author-chip author-tone-${index % 6}`}>
                    <Users size={15} />
                    {item.author}
                  </span>
                  <p>
                    {item.commentary}
                  </p>
                </div>
              ))}
            </div>
            {result.community.repeatedQuestions.length > 0 && (
              <div className="questions-box">
                <strong>Câu hỏi lặp lại</strong>
                {result.community.repeatedQuestions.map((question, index) => (
                  <p key={`${question}-${index}`}>• {question}</p>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="empty-copy">Nguồn này không có dữ liệu phản hồi cộng đồng.</p>
        )}
      </section>

      <section className="article-section deep-dive-section">
        <div className="section-heading">
          <Link2 size={20} />
          <div>
            <p className="eyebrow">Đọc kỹ hơn</p>
            <h2>Phân tích chuyên sâu</h2>
          </div>
        </div>
        {deepDiveItems.length > 0 ? (
          <div className="deep-dive-list">
            {deepDiveItems.map((item, index) => {
              const DeepDiveIcon = deepDiveIconMap[item.kind];

              return (
                <div className={`deep-dive-card deep-dive-tone-${index % 6}`} key={`${item.kind}-${item.title}-${index}`}>
                  <div className="idea-lead" aria-label={`Phân tích ${index + 1}`}>
                    <span><DeepDiveIcon size={19} /></span>
                    <strong>{String(index + 1).padStart(2, "0")}</strong>
                  </div>
                  <h3>{item.title}</h3>
                  {item.body && <p>{item.body}</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-copy">Không có thêm dữ liệu chuyên sâu từ nguồn này.</p>
        )}
      </section>

      <p className="ai-disclaimer">
        Đây là bản tóm tắt và phân tích được tạo tự động bằng AI, có thể sai sót và không
        đảm bảo chính xác 100%. Hãy xem nguồn gốc và tự kiểm chứng trước khi tin hoặc chia sẻ.
      </p>

      <div className="article-bottom-actions">
        <button type="button" className="article-share-action" onClick={copyArticleLink}>
          {linkCopied ? <Check size={17} /> : <Copy size={17} />}
          {linkCopied ? "Đã copy link" : "Copy & chia sẻ"}
        </button>
        {onAnalyzeAnother ? (
          <button type="button" onClick={onAnalyzeAnother}>
            <ArrowUpRight size={17} />
            Phân tích bài khác
          </button>
        ) : (
          <Link href="/">
            <ArrowUpRight size={17} />
            Phân tích bài khác
          </Link>
        )}
      </div>
    </article>
  );
}
