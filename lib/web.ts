import * as cheerio from "cheerio";
import type { LinkedPage } from "@/lib/types";
import { assertPublicUrl } from "@/lib/url";

const MAX_BYTES = 2_000_000;
const MAX_TEXT_LENGTH = 18_000;

async function fetchWithSafeRedirects(value: string): Promise<{ response: Response; finalUrl: string }> {
  let current = value;

  for (let redirect = 0; redirect <= 4; redirect += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "ThreadBriefVN/1.0 (+https://vercel.app)",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Liên kết chuyển hướng không hợp lệ.");
      current = new URL(location, current).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Trang trả về HTTP ${response.status}.`);
    }

    return { response, finalUrl: current };
  }

  throw new Error("Liên kết chuyển hướng quá nhiều lần.");
}

function cleanWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export async function readWebPage(value: string): Promise<LinkedPage & { links: string[] }> {
  const { response, finalUrl } = await fetchWithSafeRedirects(value);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error("Hiện chỉ hỗ trợ trang HTML.");
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BYTES) throw new Error("Trang quá lớn để phân tích.");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw new Error("Trang quá lớn để phân tích.");

  const $ = cheerio.load(buffer.toString("utf8"));
  $("script, style, noscript, iframe, svg, nav, footer, form, aside").remove();

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    new URL(finalUrl).hostname;

  const root = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");

  const links = new Set<string>();
  root.find("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, finalUrl);
      if (["http:", "https:"].includes(resolved.protocol)) {
        links.add(resolved.toString());
      }
    } catch {
      // Ignore malformed links found in third-party HTML.
    }
  });

  const text = cleanWhitespace(root.text()).slice(0, MAX_TEXT_LENGTH);
  if (text.length < 120) throw new Error("Không tìm thấy đủ nội dung có thể đọc trên trang.");

  return {
    url: finalUrl,
    title: cleanWhitespace(title).slice(0, 240),
    text,
    links: [...links].slice(0, 30),
  };
}
