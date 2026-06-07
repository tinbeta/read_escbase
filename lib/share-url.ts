const ANALYSIS_ID_PATTERN = /(?:^|-)([a-f0-9]{12})$/;

export function slugifyTitle(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 88)
    .replace(/-+$/g, "");

  return slug || "bai-viet";
}

export function getAnalysisPath(title: string, id: string | null): string {
  if (!id) return "/";
  return `/${slugifyTitle(title)}-${id}`;
}

export function extractAnalysisId(value: string): string | null {
  return value.match(ANALYSIS_ID_PATTERN)?.[1] ?? null;
}
