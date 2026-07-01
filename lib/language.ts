const CJK_PATTERN = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g;

function collectText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return value.map(collectText).join("\n");
  return Object.values(value).map(collectText).join("\n");
}

export function hasTooMuchNonVietnameseCjk(result: unknown): boolean {
  const text = collectText(result)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\S+/g, "");
  const cjkCount = text.match(CJK_PATTERN)?.length ?? 0;
  return cjkCount > 80;
}
