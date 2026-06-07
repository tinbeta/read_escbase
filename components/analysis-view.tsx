"use client";

import {
  ArrowUpRight,
  BookOpen,
  Check,
  Clock3,
  Copy,
  Link2,
  MessageCircleMore,
  Quote,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import type { AnalysisResult } from "@/lib/schemas";
import { analysisToText } from "@/lib/format";
import { getAnalysisPath } from "@/lib/share-url";

type Props = {
  result: AnalysisResult;
  sourceUrl: string;
  slug?: string | null;
};

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

function buildDeepDiveItems(result: AnalysisResult) {
  const items: Array<{ title: string; body: string }> = [];

  if (result.takeaway) {
    items.push({ title: "Kết luận cần nhớ", body: result.takeaway });
  }

  for (const caveat of result.caveats.slice(0, 4)) {
    items.push({ title: "Điểm cần thận trọng", body: caveat });
  }

  for (const source of result.linkedSources.slice(0, 3)) {
    items.push({
      title: `Link tác giả dẫn: ${source.title}`,
      body: `${source.contribution} Hỗ trợ: ${source.supports}`,
    });
  }

  for (const item of result.timeline.slice(0, 3)) {
    items.push({
      title: `Bối cảnh thời gian: ${item.time}`,
      body: item.event,
    });
  }

  return items;
}

export function AnalysisView({ result, sourceUrl, slug }: Props) {
  const [copied, setCopied] = useState(false);
  const deepDiveItems = buildDeepDiveItems(result);

  async function copyArticle() {
    await navigator.clipboard.writeText(analysisToText(result, sourceUrl));
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
    <article className="result-shell">
      <header className="article-header">
        <div className="article-kicker">
          <Sparkles size={15} />
          Bản đọc nhanh bằng AI
        </div>
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
          <button type="button" onClick={copyArticle}>
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? "Đã copy" : "Copy bài"}
          </button>
          <button type="button" className="primary-action" onClick={shareArticle}>
            <Share2 size={17} />
            Chia sẻ
          </button>
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
        <div className="point-list">
          {result.mainPoints.map((point, index) => (
            <div className="point-card" key={`${point.title}-${index}`}>
              <span className={`evidence evidence-${point.evidence}`}>
                {evidenceLabels[point.evidence]}
              </span>
              <h3>{point.title}</h3>
              <p>{point.explanation}</p>
            </div>
          ))}
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
                <div key={`${item.author}-${index}`}>
                  <Users size={16} />
                  <p>
                    <strong>{item.author}</strong>
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
            {deepDiveItems.map((item, index) => (
              <div key={`${item.title}-${index}`}>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-copy">Không có thêm dữ liệu chuyên sâu từ nguồn này.</p>
        )}
      </section>

      <div className="article-return">
        <Link href="/">
          <ArrowUpRight size={17} />
          Phân tích bài khác
        </Link>
      </div>
    </article>
  );
}
