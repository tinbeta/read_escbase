import { describe, expect, it } from "vitest";
import type { VideoAnalysisResult } from "./video-schemas";
import { normalizeVideoAnalysisResult } from "./video-result";

function makeResult(
  factCheck: VideoAnalysisResult["factCheck"],
): VideoAnalysisResult {
  return {
    title: "Một video cần kiểm chứng",
    subtitle: "Tóm tắt ngắn",
    platform: "facebook",
    durationSeconds: 60,
    language: "vi",
    summary: {
      overview: "Video nói về một trải nghiệm cá nhân.",
      mainPoints: [
        {
          title: "Ý chính",
          explanation: "Người nói chia sẻ quan điểm và một số kết luận cần kiểm chứng.",
        },
      ],
      keyQuotes: [],
    },
    factCheck,
  };
}

describe("video result normalization", () => {
  it("uses needs_context instead of mixed when claims are accurate plus context-only", () => {
    const result = normalizeVideoAnalysisResult(
      makeResult({
        overallVerdict: "mixed",
        summary: "Có ý đúng nhưng một số ý cần thêm bối cảnh.",
        claims: [
          {
            claim: "Chánh niệm có thể giúp giảm căng thẳng.",
            verdict: "accurate",
            explanation: "Nhiều nguồn y tế ghi nhận lợi ích này.",
            sources: [],
          },
          {
            claim: "Sống ở hiện tại luôn giúp con người bình an.",
            verdict: "needs_context",
            explanation: "Câu này phụ thuộc vào hoàn cảnh và cách thực hành.",
            sources: [],
          },
        ],
        sources: [],
        caveats: [],
      }),
    );

    expect(result.factCheck.overallVerdict).toBe("needs_context");
  });

  it("keeps mixed only when at least one claim is accurate and one is wrong", () => {
    const result = normalizeVideoAnalysisResult(
      makeResult({
        overallVerdict: "mostly_accurate",
        summary: "Video có cả ý đúng và ý sai.",
        claims: [
          {
            claim: "Một ý có nguồn xác nhận.",
            verdict: "accurate",
            explanation: "Nguồn đáng tin xác nhận.",
            sources: [],
          },
          {
            claim: "Một ý khác gây hiểu sai.",
            verdict: "misleading",
            explanation: "Cách nói thiếu điều kiện quan trọng.",
            sources: [],
          },
        ],
        sources: [],
        caveats: [],
      }),
    );

    expect(result.factCheck.overallVerdict).toBe("mixed");
  });

  it("keeps the model fallback when there are no claim cards", () => {
    const result = normalizeVideoAnalysisResult(
      makeResult({
        overallVerdict: "unverifiable",
        summary: "Video quá thiếu dữ kiện để kiểm chứng.",
        claims: [],
        sources: [],
        caveats: [],
      }),
    );

    expect(result.factCheck.overallVerdict).toBe("unverifiable");
  });

  it("removes isolated non-Vietnamese script artifacts from generated text", () => {
    const result = normalizeVideoAnalysisResult(
      makeResult({
        overallVerdict: "opinion_no_factual_claims",
        summary: "Đây là trải nghiệm cá nhân, không phải тơ kiểm chứng độc lập.",
        claims: [],
        sources: [
          {
            title: "Nguồn có chữ lạ Է",
            url: "https://example.com/path?q=%D5%B7",
          },
        ],
        caveats: [],
      }),
    );

    expect(result.factCheck.summary).toBe(
      "Đây là trải nghiệm cá nhân, không phải kiểm chứng độc lập.",
    );
    expect(result.factCheck.sources[0]?.title).toBe("Nguồn có chữ lạ");
    expect(result.factCheck.sources[0]?.url).toBe("https://example.com/path?q=%D5%B7");
  });
});
