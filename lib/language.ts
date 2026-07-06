const CJK_PATTERN = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g;
const UNEXPECTED_SCRIPT_PATTERN =
  /[\u0370-\u03ff\u0400-\u052f\u0530-\u058f\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\u0900-\u097f\u0980-\u09ff\u0e00-\u0e7f\u10a0-\u10ff\u1200-\u137f\u1780-\u17ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g;
const UNEXPECTED_SCRIPT_TOKEN_PATTERN =
  /\S*[\u0370-\u03ff\u0400-\u052f\u0530-\u058f\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\u0900-\u097f\u0980-\u09ff\u0e00-\u0e7f\u10a0-\u10ff\u1200-\u137f\u1780-\u17ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]\S*/g;

function collectText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return value.map(collectText).join("\n");
  return Object.values(value).map(collectText).join("\n");
}

function removeIgnoredText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\S+/g, "");
}

export function hasTooMuchNonVietnameseCjk(result: unknown): boolean {
  const text = removeIgnoredText(collectText(result));
  const cjkCount = text.match(CJK_PATTERN)?.length ?? 0;
  return cjkCount > 80;
}

export function hasTooManyUnexpectedLanguageArtifacts(result: unknown): boolean {
  const text = removeIgnoredText(collectText(result));
  const unexpectedCount = text.match(UNEXPECTED_SCRIPT_PATTERN)?.length ?? 0;
  return unexpectedCount > 24;
}

export function stripUnexpectedLanguageArtifacts(text: string): string {
  return text
    .replace(UNEXPECTED_SCRIPT_TOKEN_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}
