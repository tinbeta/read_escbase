"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Box,
  Check,
  Clock3,
  Copy,
  Hash,
  Link2,
  MessageCircleMore,
  Quote,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import type { AnalysisResult } from "@/lib/schemas";
import { analysisToText } from "@/lib/format";

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

export function AnalysisView({ result, sourceUrl, slug }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyArticle() {
    await navigator.clipboard.writeText(analysisToText(result, sourceUrl));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareArticle() {
    const shareUrl = slug ? `${window.location.origin}/a/${slug}` : window.location.href;
    const data = { title: result.title, text: result.subtitle, url: shareUrl };
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
          <p className="eyebrow">Tổng quan</p>
          <p>{result.overview}</p>
        </div>
      </section>

      <section className="article-section">
        <div className="section-heading">
          <Quote size={20} />
          <div>
            <p className="eyebrow">Đọc phần cốt lõi</p>
            <h2>Những ý chính</h2>
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

      {(result.factsAndFigures.length > 0 || result.peopleAndProducts.length > 0) && (
        <section className="split-grid">
          {result.factsAndFigures.length > 0 && (
            <div className="article-section compact-section">
              <div className="section-heading">
                <Hash size={20} />
                <h2>Dữ kiện & con số</h2>
              </div>
              <div className="fact-list">
                {result.factsAndFigures.map((item, index) => (
                  <div key={`${item.value}-${index}`}>
                    <strong>{item.value}</strong>
                    <p>{item.context}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.peopleAndProducts.length > 0 && (
            <div className="article-section compact-section">
              <div className="section-heading">
                <Box size={20} />
                <h2>Người & sản phẩm</h2>
              </div>
              <div className="entity-list">
                {result.peopleAndProducts.map((item, index) => (
                  <div key={`${item.name}-${index}`}>
                    <strong>{item.name}</strong>
                    <span>{item.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {result.timeline.length > 0 && (
        <section className="article-section">
          <div className="section-heading">
            <Clock3 size={20} />
            <div>
              <p className="eyebrow">Theo trình tự</p>
              <h2>Dòng thời gian</h2>
            </div>
          </div>
          <div className="timeline">
            {result.timeline.map((item, index) => (
              <div className="timeline-item" key={`${item.time}-${index}`}>
                <span>{item.time}</span>
                <p>{item.event}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="article-section community-section">
        <div className="section-heading">
          <MessageCircleMore size={21} />
          <div>
            <p className="eyebrow">Bình luận, không phải dữ kiện</p>
            <h2>Cộng đồng nói gì?</h2>
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

      {result.linkedSources.length > 0 && (
        <section className="article-section">
          <div className="section-heading">
            <Link2 size={20} />
            <div>
              <p className="eyebrow">Đã mở và đọc</p>
              <h2>Liên kết từ tác giả</h2>
            </div>
          </div>
          <div className="source-list">
            {result.linkedSources.map((item, index) => (
              <a href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${index}`}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.contribution}</p>
                  <span>Hỗ trợ: {item.supports}</span>
                </div>
                <ArrowUpRight size={18} />
              </a>
            ))}
          </div>
        </section>
      )}

      {result.caveats.length > 0 && (
        <section className="caveat-card">
          <AlertTriangle size={20} />
          <div>
            <h2>Điều cần lưu ý</h2>
            {result.caveats.map((item, index) => (
              <p key={`${item}-${index}`}>• {item}</p>
            ))}
          </div>
        </section>
      )}

      <footer className="takeaway-card">
        <Check size={21} />
        <div>
          <p className="eyebrow">Kết luận ngắn</p>
          <p>{result.takeaway}</p>
        </div>
      </footer>
    </article>
  );
}
