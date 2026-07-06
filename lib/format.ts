import type { AnalysisResult } from "@/lib/schemas";
import type { VideoAnalysisResult } from "@/lib/video-schemas";
import { normalizeVideoAnalysisResult } from "@/lib/video-result";

const evidenceLabels = {
  author_claim: "Tuyên bố của tác giả",
  supported_by_link: "Có nguồn liên kết hỗ trợ",
  context: "Bối cảnh",
} as const;

export function analysisToText(result: AnalysisResult, sourceUrl: string): string {
  const lines = [
    result.title,
    result.subtitle,
    "",
    "🧭 Tổng quan",
    result.overview,
    "",
    "🔎 Những ý chính",
    ...result.mainPoints.map(
      (point) => `• ${point.title}: ${point.explanation} (${evidenceLabels[point.evidence]})`,
    ),
  ];

  if (result.factsAndFigures.length) {
    lines.push(
      "",
      "🔢 Dữ kiện và con số",
      ...result.factsAndFigures.map((item) => `• ${item.value}: ${item.context}`),
    );
  }

  if (result.timeline.length) {
    lines.push(
      "",
      "🕒 Dòng thời gian",
      ...result.timeline.map((item) => `• ${item.time}: ${item.event}`),
    );
  }

  if (result.community.available) {
    lines.push(
      "",
      "💬 Cộng đồng nói gì (ý kiến, không phải dữ kiện đã kiểm chứng)",
      result.community.summary,
      ...result.community.highlights.map(
        (item) => `• ${item.author}: ${item.commentary}`,
      ),
    );
  }

  if (result.linkedSources.length) {
    lines.push(
      "",
      "🔗 Nguồn tác giả dẫn",
      ...result.linkedSources.map(
        (item) => `• ${item.title}: ${item.contribution}\n  ${item.url}`,
      ),
    );
  }

  if (result.caveats.length) {
    lines.push("", "⚠️ Lưu ý", ...result.caveats.map((item) => `• ${item}`));
  }

  lines.push("", "✅ Kết luận", result.takeaway, "", `Nguồn gốc: ${sourceUrl}`);
  return lines.join("\n");
}

const overallVerdictLabels = {
  mostly_accurate: "Đa số chính xác",
  mixed: "Có đúng có sai",
  mostly_inaccurate: "Đa số không chính xác",
  needs_context: "Cần thêm bối cảnh",
  unverifiable: "Không thể kiểm chứng",
  opinion_no_factual_claims: "Chỉ là ý kiến, không có tuyên bố cần kiểm chứng",
} as const;

const claimVerdictLabels = {
  accurate: "Chính xác",
  inaccurate: "Không chính xác",
  misleading: "Gây hiểu sai",
  needs_context: "Cần thêm bối cảnh",
  unverifiable: "Không thể kiểm chứng",
  opinion: "Ý kiến",
} as const;

export function videoAnalysisToText(result: VideoAnalysisResult, sourceUrl: string): string {
  const displayResult = normalizeVideoAnalysisResult(result);
  const lines = [
    displayResult.title,
    displayResult.subtitle,
    "",
    "🧭 Tóm tắt nội dung",
    displayResult.summary.overview,
    "",
    "🔎 Ý chính",
    ...displayResult.summary.mainPoints.map((point) => `• ${point.title}: ${point.explanation}`),
  ];

  if (displayResult.summary.keyQuotes.length) {
    lines.push("", "💬 Trích dẫn đáng chú ý", ...displayResult.summary.keyQuotes.map((quote) => `• "${quote}"`));
  }

  lines.push(
    "",
    `✅ Kiểm chứng tính đúng sai — ${overallVerdictLabels[displayResult.factCheck.overallVerdict]}`,
    displayResult.factCheck.summary,
  );

  if (displayResult.factCheck.claims.length) {
    lines.push(
      "",
      "Chi tiết từng tuyên bố:",
      ...displayResult.factCheck.claims.map(
        (claim) => `• [${claimVerdictLabels[claim.verdict]}] ${claim.claim}\n  ${claim.explanation}`,
      ),
    );
  }

  if (displayResult.factCheck.sources.length) {
    lines.push(
      "",
      "🔗 Nguồn đã dùng để kiểm chứng",
      ...displayResult.factCheck.sources.map((source) => `• ${source.title}\n  ${source.url}`),
    );
  }

  if (displayResult.factCheck.caveats.length) {
    lines.push("", "⚠️ Lưu ý", ...displayResult.factCheck.caveats.map((item) => `• ${item}`));
  }

  lines.push("", `Nguồn gốc: ${sourceUrl}`);
  return lines.join("\n");
}
