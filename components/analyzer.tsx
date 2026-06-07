"use client";

import {
  ArrowRight,
  ArrowUpRight,
  ClipboardPaste,
  Clock3,
  LoaderCircle,
  Newspaper,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { AnalysisView } from "@/components/analysis-view";
import { QuotaMeter } from "@/components/quota-meter";
import type {
  AnalysisListItem,
  QuotaStatus,
  StoredAnalysis,
  TodayAnalyses,
} from "@/lib/types";
import { useEffect } from "react";

type AnalysisResponse = StoredAnalysis & {
  cached?: boolean;
  requestTokens?: number;
};

const examples = [
  "https://x.com/username/status/123...",
  "https://example.com/blog/bai-viet",
];

type Props = {
  initialTodayAnalyses: TodayAnalyses;
};

function formatVietnamTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function Analyzer({ initialTodayAnalyses }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [todayCount, setTodayCount] = useState(initialTodayAnalyses.count);
  const [todayItems, setTodayItems] = useState(initialTodayAnalyses.items);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/quota", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        if (!body.error) setQuota(body);
      })
      .catch(() => undefined);
  }, []);

  async function pasteUrl() {
    setError("");
    try {
      const clipboardText = (await navigator.clipboard.readText()).trim();
      if (!clipboardText) {
        throw new Error("Clipboard đang trống.");
      }
      setUrl(clipboardText);
      inputRef.current?.focus();
    } catch (clipboardError) {
      setError(
        clipboardError instanceof Error
          ? `Không thể dán: ${clipboardError.message}`
          : "Không thể đọc clipboard. Hãy cấp quyền rồi thử lại.",
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await response.json();
      if (body.quota) setQuota(body.quota);
      if (!response.ok) throw new Error(body.error || "Không thể phân tích đường dẫn.");
      setAnalysis(body);
      if (!body.cached && body.slug) {
        const newItem: AnalysisListItem = {
          slug: body.slug,
          title: body.result.title,
          sourceType: body.sourceType,
          createdAt: body.createdAt,
        };
        setTodayItems((items) => [newItem, ...items.filter((item) => item.slug !== body.slug)].slice(0, 10));
        setTodayCount((count) => count + 1);
      }
      window.setTimeout(() => {
        document.getElementById("analysis-result")?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="hero-art" aria-hidden="true">
          <div className="hero-paper hero-paper-quote">
            <span>“</span>
            <i />
            <i />
            <i />
          </div>
          <div className="hero-logo-ring">
            <Image
              src="/esclogo.png"
              alt=""
              width={420}
              height={420}
              priority
            />
          </div>
          <div className="hero-paper hero-paper-story">
            <b />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={15} />
            Escbase AI Reader
          </div>
          <h1>
            Đọc nhanh
            <br />
            <span>X hoặc Blog</span>
          </h1>
          <p className="hero-copy">
            AI đọc nội dung gốc, phản hồi cộng đồng và các liên kết liên quan, rồi biên tập
            thành bài tiếng Việt rõ ràng.
          </p>

          <form className="analyze-form" onSubmit={submit}>
            <div className="url-field">
              <Newspaper size={20} />
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={examples[0]}
                required
                aria-label="Đường dẫn X hoặc bài blog"
              />
              <button
                className="paste-button"
                type="button"
                onClick={pasteUrl}
                aria-label="Dán đường dẫn từ clipboard"
              >
                <ClipboardPaste size={15} />
              </button>
            </div>
            <button type="submit" disabled={loading || quota?.remaining === 0}>
              {loading ? <LoaderCircle className="spin" size={19} /> : <ArrowRight size={19} />}
              {loading
                ? "Đang đọc nguồn..."
                : quota?.remaining === 0
                  ? "Mở lại lúc 07:00"
                  : "Phân tích ngay"}
            </button>
          </form>
          {error && <p className="form-error">{error}</p>}
          <p className="privacy-note">
            Link X/Twitter hoặc blog công khai. Nội dung được gửi tới OpenAI để phân tích.
          </p>
        </div>
      </section>

      <section className="process-strip" aria-label="Quy trình phân tích">
        <div><span>01</span><p>Đọc nội dung gốc</p></div>
        <div><span>02</span><p>Đọc replies & link</p></div>
        <div><span>03</span><p>Biên tập tiếng Việt</p></div>
      </section>

      <section className="today-section" aria-labelledby="today-heading">
        <div className="today-heading">
          <div>
            <p className="eyebrow">Thư viện hôm nay</p>
            <h2 id="today-heading">
              <strong>{new Intl.NumberFormat("vi-VN").format(todayCount)}</strong> bài đã thực hiện
            </h2>
          </div>
          <span><Clock3 size={15} /> Cập nhật theo giờ Việt Nam</span>
        </div>

        {todayItems.length > 0 ? (
          <div className="today-list">
            {todayItems.map((item) => (
              <Link href={`/a/${item.slug}`} key={item.slug}>
                <span className="today-time">{formatVietnamTime(item.createdAt)}</span>
                <span className="today-source">{item.sourceType === "x" ? "X" : "Blog"}</span>
                <strong>{item.title}</strong>
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="today-empty">Chưa có bài nào hôm nay. Hãy là người mở bài đầu tiên.</p>
        )}
      </section>

      {analysis && (
        <div id="analysis-result" className="result-anchor">
          <p className={`result-usage${analysis.cached ? " result-cached" : ""}`}>
            {analysis.cached
              ? "Đã dùng bản cache từ database — không tiêu thêm token OpenAI."
              : `Bài này đã dùng ${new Intl.NumberFormat("vi-VN").format(
                  analysis.requestTokens ?? 0,
                )} token.`}
          </p>
          <AnalysisView
            result={analysis.result}
            sourceUrl={analysis.sourceUrl}
            slug={analysis.slug}
          />
        </div>
      )}

      <section className="quota-footer" aria-label="Quota OpenAI">
        <QuotaMeter quota={quota} />
      </section>
    </>
  );
}
