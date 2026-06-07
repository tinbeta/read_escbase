"use client";

import { ArrowRight, ClipboardPaste, LoaderCircle, Newspaper, Sparkles } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { AnalysisView } from "@/components/analysis-view";
import { QuotaMeter } from "@/components/quota-meter";
import type { QuotaStatus, StoredAnalysis } from "@/lib/types";
import { useEffect } from "react";

type AnalysisResponse = StoredAnalysis & {
  cached?: boolean;
  requestTokens?: number;
};

const examples = [
  "https://x.com/username/status/123...",
  "https://example.com/blog/bai-viet",
];

export function Analyzer() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
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
        <div className="hero-badge">
          <Sparkles size={15} />
          Thread, blog, cộng đồng — trong một bài đọc
        </div>
        <h1>
          Dán một đường dẫn.
          <br />
          <span>Hiểu toàn bộ câu chuyện.</span>
        </h1>
        <p className="hero-copy">
          AI đọc thread X, phản hồi cộng đồng và các liên kết tác giả chia sẻ, rồi biên tập
          thành bài tóm tắt tiếng Việt rõ ràng.
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
              Dán
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
          Chấp nhận link X/Twitter và bài blog công khai. Nội dung được gửi tới OpenAI để phân tích.
        </p>
      </section>

      <section className="process-strip" aria-label="Quy trình phân tích">
        <div><span>01</span><p>Đọc nội dung gốc</p></div>
        <div><span>02</span><p>Đọc replies & link</p></div>
        <div><span>03</span><p>Biên tập tiếng Việt</p></div>
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
