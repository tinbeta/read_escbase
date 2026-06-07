import type { AnalysisResult } from "@/lib/schemas";

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
