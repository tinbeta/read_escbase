"use client";

import {
  ArrowRight,
  ArrowUpRight,
  ClipboardPaste,
  Clock3,
  LoaderCircle,
  LogOut,
  Newspaper,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AnalysisView } from "@/components/analysis-view";
import { VideoAnalysisView } from "@/components/video-analysis-view";
import { QuotaMeter } from "@/components/quota-meter";
import { getAnalysisPath } from "@/lib/share-url";
import { detectVideoPlatform } from "@/lib/video-platform";
import { useAuth } from "@/lib/auth-context";
import type { AnalysisResult } from "@/lib/schemas";
import type { VideoAnalysisResult } from "@/lib/video-schemas";
import type {
  QuotaStatus,
  StoredAnalysis,
  TodayAnalyses,
} from "@/lib/types";

type AnalysisResponse = StoredAnalysis & {
  cached?: boolean;
  requestTokens?: number;
};

const examples = [
  "https://www.tiktok.com/@user/video/...",
  "https://www.youtube.com/shorts/...",
  "https://x.com/username/status/123...",
  "https://example.com/blog/bai-viet",
];
const sourceTypeLabels = { x: "X", web: "Blog", video: "Video" } as const;
const TODAY_PAGE_SIZE = 10;
const textLoadingSteps = [
  {
    label: "Đang đọc nguồn...",
    detail: "Mở link và lấy nội dung gốc.",
  },
  {
    label: "Đang gom ngữ cảnh...",
    detail: "Kiểm tra replies, link liên quan và dữ liệu phụ.",
  },
  {
    label: "Đang lọc ý chính...",
    detail: "Tách dữ kiện, ý kiến cộng đồng và điểm cần chú ý.",
  },
  {
    label: "Đang biên tập tiếng Việt...",
    detail: "Viết lại thành bản đọc nhanh, rõ ý trên mobile.",
  },
  {
    label: "Đang rà lại kết quả...",
    detail: "Kiểm tra ngôn ngữ, cấu trúc và phần chia sẻ.",
  },
  {
    label: "Sắp xong rồi...",
    detail: "Thread dài hoặc có nhiều link có thể mất hơn 30 giây.",
  },
] as const;

const videoLoadingSteps = [
  {
    label: "Đang tải video...",
    detail: "Lấy nội dung âm thanh từ video.",
  },
  {
    label: "Đang nghe nội dung video...",
    detail: "Chuyển lời thoại trong video thành văn bản, video dài sẽ mất lâu hơn.",
  },
  {
    label: "Đang tóm tắt nội dung...",
    detail: "Tách ý chính và trích dẫn đáng chú ý từ bản transcript.",
  },
  {
    label: "Đang tìm nguồn kiểm chứng...",
    detail: "AI dùng web search để đối chiếu các tuyên bố với nguồn uy tín.",
  },
  {
    label: "Đang tổng hợp kết quả...",
    detail: "Ghép tóm tắt và phần kiểm chứng tính đúng sai lại với nhau.",
  },
  {
    label: "Sắp xong rồi...",
    detail: "Video dài hoặc có nhiều tuyên bố cần kiểm chứng có thể mất vài phút.",
  },
] as const;

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

function formatTokenCount(value: number | null) {
  if (!value) return "chưa lưu token";
  return `${new Intl.NumberFormat("vi-VN").format(value)} token`;
}

export function Analyzer({ initialTodayAnalyses }: Props) {
  const router = useRouter();
  const { accessToken, signOut } = useAuth();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [todayCount, setTodayCount] = useState(initialTodayAnalyses.count);
  const [todayItems, setTodayItems] = useState(initialTodayAnalyses.items);
  const [todayPage, setTodayPage] = useState(1);
  const [todayLoading, setTodayLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isVideoRequest, setIsVideoRequest] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const todayTotalPages = Math.max(1, Math.ceil(todayCount / TODAY_PAGE_SIZE));
  const loadingSteps = isVideoRequest ? videoLoadingSteps : textLoadingSteps;
  const currentLoadingStep = loadingSteps[loadingStep] ?? loadingSteps[0];

  const authHeaders: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  useEffect(() => {
    fetch("/api/quota", { cache: "no-store", headers: authHeaders })
      .then((response) => response.json())
      .then((body) => {
        if (!body.error) setQuota(body);
      })
      .catch(() => undefined);
    // Only re-run when the token itself changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (!loading) return;

    const startedAt = Date.now();

    const timer = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const nextStep = Math.min(
        Math.floor(elapsedSeconds / 6),
        loadingSteps.length - 1,
      );
      const earlyProgress = 7 + (Math.min(elapsedSeconds, 42) / 42) * 76;
      const lateProgress =
        elapsedSeconds > 42 ? Math.min((elapsedSeconds - 42) / 50, 1) * 11 : 0;

      setLoadingStep(nextStep);
      setLoadingProgress(Math.min(94, Math.round(earlyProgress + lateProgress)));
    }, 700);

    return () => window.clearInterval(timer);
  }, [loading, loadingSteps]);

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
    setLoadingStep(0);
    setLoadingProgress(7);
    setIsVideoRequest(detectVideoPlatform(url) !== null);
    setLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ url }),
      });
      const body = await response.json();
      if (body.quota) setQuota(body.quota);
      if (!response.ok) throw new Error(body.error || "Không thể phân tích đường dẫn.");

      // Once saved, jump straight to the article page instead of showing it
      // inline and scrolling. Falls back to inline render when there's no slug
      // (e.g. Supabase not configured).
      if (body.slug) {
        router.push(getAnalysisPath(body.result.title, body.slug));
        return;
      }

      setAnalysis(body);
      window.setTimeout(() => {
        document.getElementById("analysis-result")?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
      setLoadingStep(0);
      setLoadingProgress(0);
    }
  }

  async function loadTodayPage(page: number, force = false) {
    if (page < 1 || page > todayTotalPages || (!force && page === todayPage)) return;
    setTodayLoading(true);
    try {
      const response = await fetch(`/api/analyses/today?page=${page}&pageSize=${TODAY_PAGE_SIZE}`, {
        cache: "no-store",
        headers: authHeaders,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Không thể tải trang bài hôm nay.");
      setTodayItems(body.items ?? []);
      setTodayCount(body.count ?? 0);
      setTodayPage(page);
    } catch (pageError) {
      setError(pageError instanceof Error ? pageError.message : "Không thể tải trang bài hôm nay.");
    } finally {
      setTodayLoading(false);
    }
  }

  function analyzeAnother() {
    setAnalysis(null);
    setError("");
    setUrl("");
    window.requestAnimationFrame(() => {
      document.querySelector(".hero")?.scrollIntoView({ behavior: "smooth", block: "start" });
      inputRef.current?.focus({ preventScroll: true });
    });
  }

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="hero-top-row">
            <div className="hero-brand">
              <Image
                src="/esclogo-classic-v2.png"
                alt=""
                width={72}
                height={72}
                priority
              />
              <span>
                Fast <strong>Escbase</strong>
              </span>
            </div>
            {accessToken && (
              <button className="hero-account" type="button" onClick={signOut} aria-label="Đăng xuất">
                <LogOut size={16} />
              </button>
            )}
          </div>
          <h1>
            <span className="headline-line">
              <span className="headline-copy">Đọc nhanh</span>
            </span>
            <span className="headline-line">
              <em>Video ngắn</em>
            </span>
          </h1>
          <div className="hero-badge">
            <Sparkles size={15} />
            Tóm tắt & kiểm chứng bằng AI
          </div>
          <p className="hero-copy">
            Dán link TikTok, Facebook Reel hoặc Youtube Short để AI tóm tắt và kiểm chứng
            tính đúng sai của nội dung.
          </p>
          <p className="hero-subcopy">
            Vẫn đọc được thread X/Twitter và bài blog nếu bạn dán link đó vào ô bên dưới.
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
                aria-label="Đường dẫn TikTok, YouTube Short, Facebook Reel, X hoặc blog"
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
            <button type="submit" disabled={loading || quota?.exhausted}>
              {loading ? <LoaderCircle className="spin" size={19} /> : <ArrowRight size={19} />}
              {loading
                ? currentLoadingStep.label
                : quota?.exhausted
                  ? "Mở lại lúc 07:00"
                  : "Phân tích ngay"}
            </button>
          </form>
          {loading && (
            <div className="loading-progress-card" role="status" aria-live="polite">
              <div className="loading-progress-top">
                <span>{currentLoadingStep.detail}</span>
                <strong>{loadingProgress}%</strong>
              </div>
              <div
                className="loading-progress-track"
                aria-label="Tiến trình phân tích ước lượng"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={loadingProgress}
                role="progressbar"
              >
                <span style={{ width: `${loadingProgress}%` }} />
              </div>
              <p>
                {isVideoRequest
                  ? "Video có thể mất 1-3 phút để tải, transcribe và kiểm chứng, tuỳ độ dài."
                  : "Thường mất 20-60 giây nếu thread dài, có nhiều replies hoặc link ngoài."}
              </p>
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
          <p className="privacy-note">
            Chỉ dán link công khai (TikTok, YouTube, Facebook Reel, X/Twitter hoặc blog).
            Nội dung được gửi tới OpenAI để tóm tắt và tìm nguồn kiểm chứng.
          </p>
        </div>
      </section>

      <section className="process-strip" aria-label="Quy trình phân tích">
        <div><span>01</span><p>Nghe & đọc nội dung</p></div>
        <div><span>02</span><p>Tóm tắt ý chính</p></div>
        <div><span>03</span><p>Kiểm chứng bằng nguồn uy tín</p></div>
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
          <>
            <div className={`today-list${todayLoading ? " today-list-loading" : ""}`}>
              {todayItems.map((item) => (
                <Link href={getAnalysisPath(item.title, item.slug)} key={item.slug}>
                  <span className="today-time">{formatVietnamTime(item.createdAt)}</span>
                  <span className="today-source">{sourceTypeLabels[item.sourceType]}</span>
                  <span className="today-title">
                    <strong>{item.title}</strong>
                    <small>{formatTokenCount(item.tokenCount)}</small>
                  </span>
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              ))}
            </div>
            {todayTotalPages > 1 && (
              <div className="today-pagination">
                <button
                  type="button"
                  onClick={() => loadTodayPage(todayPage - 1)}
                  disabled={todayLoading || todayPage === 1}
                >
                  Trước
                </button>
                <span>
                  Trang {todayPage}/{todayTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => loadTodayPage(todayPage + 1)}
                  disabled={todayLoading || todayPage === todayTotalPages}
                >
                  Sau
                </button>
              </div>
            )}
          </>
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
          {analysis.sourceType === "video" ? (
            <VideoAnalysisView
              result={analysis.result as VideoAnalysisResult}
              sourceUrl={analysis.sourceUrl}
              slug={analysis.slug}
              onAnalyzeAnother={analyzeAnother}
            />
          ) : (
            <AnalysisView
              result={analysis.result as AnalysisResult}
              sourceUrl={analysis.sourceUrl}
              slug={analysis.slug}
              onAnalyzeAnother={analyzeAnother}
            />
          )}
        </div>
      )}

      <section className="quota-footer" aria-label="Quota OpenAI">
        <QuotaMeter quota={quota} />
      </section>
    </>
  );
}
