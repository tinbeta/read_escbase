import "server-only";

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { readWebPage } from "@/lib/web";

type LocalWebSearchProvider = "searxng" | "brave" | "duckduckgo";
type SourceQuality = "high" | "medium" | "low";

export type LocalWebSearchInput = {
  query: string;
  allowedDomains?: string[];
  blockedDomains?: string[];
  maxResults?: number;
};

type SearchCandidate = {
  title: string;
  url: string;
  snippet: string;
  provider: LocalWebSearchProvider;
  rank: number;
};

export type LocalWebSearchResult = {
  title: string;
  url: string;
  publisher: string;
  snippet: string;
  text: string;
  sourceQuality: SourceQuality;
  score: number;
};

export type LocalWebSearchResponse = {
  query: string;
  provider: LocalWebSearchProvider | "none";
  cached: boolean;
  generatedAt: string;
  results: LocalWebSearchResult[];
  errors: string[];
};

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS = 8;
const DEFAULT_CACHE_TTL_HOURS = 24;
const PAGE_TEXT_LIMIT = 4_500;
const QUERY_LIMIT = 300;

const HIGH_QUALITY_HOSTS = [
  "apnews.com",
  "bbc.com",
  "cdc.gov",
  "clinicaltrials.gov",
  "ec.europa.eu",
  "ema.europa.eu",
  "fda.gov",
  "ft.com",
  "gov.uk",
  "nature.com",
  "nih.gov",
  "openai.com",
  "pubmed.ncbi.nlm.nih.gov",
  "reuters.com",
  "science.org",
  "sec.gov",
  "statista.com",
  "theguardian.com",
  "who.int",
];

const LOW_QUALITY_HOSTS = [
  "facebook.com",
  "instagram.com",
  "medium.com",
  "quora.com",
  "reddit.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
];

function readNumberEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function clampMaxResults(value: number | undefined): number {
  if (!value) return readNumberEnv("WEB_SEARCH_MAX_RESULTS", DEFAULT_MAX_RESULTS, 1, MAX_RESULTS);
  return Math.min(MAX_RESULTS, Math.max(1, Math.trunc(value)));
}

function normalizeDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^www\./, "").replace(/^\*\./, "");
  }
}

function domainMatches(hostname: string, domains: string[]): boolean {
  const normalizedHost = hostname.toLowerCase().replace(/^www\./, "");
  return domains.some((domain) => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`));
}

function cleanSearchUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["fbclid", "gclid"].includes(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value: string, limit = 900): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function getHostname(value: string): string {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
}

function isHighQualityHost(hostname: string): boolean {
  return (
    hostname.endsWith(".gov") ||
    hostname.endsWith(".edu") ||
    domainMatches(hostname, HIGH_QUALITY_HOSTS)
  );
}

function isLowQualityHost(hostname: string): boolean {
  return domainMatches(hostname, LOW_QUALITY_HOSTS);
}

function sourceQuality(hostname: string): SourceQuality {
  if (isHighQualityHost(hostname)) return "high";
  if (isLowQualityHost(hostname)) return "low";
  return "medium";
}

function scoreCandidate(candidate: SearchCandidate): number {
  const hostname = getHostname(candidate.url);
  let score = 100 - candidate.rank * 4;
  if (isHighQualityHost(hostname)) score += 25;
  if (hostname.endsWith(".org")) score += 5;
  if (isLowQualityHost(hostname)) score -= 35;
  if (candidate.title.length > 12) score += 4;
  if (candidate.snippet.length > 80) score += 4;
  return score;
}

function filterAndRankCandidates(
  candidates: SearchCandidate[],
  allowedDomains: string[],
  blockedDomains: string[],
): SearchCandidate[] {
  const seen = new Set<string>();
  const filtered: SearchCandidate[] = [];

  for (const candidate of candidates) {
    const cleanedUrl = cleanSearchUrl(candidate.url);
    if (!cleanedUrl) continue;

    const hostname = getHostname(cleanedUrl);
    if (allowedDomains.length && !domainMatches(hostname, allowedDomains)) continue;
    if (blockedDomains.length && domainMatches(hostname, blockedDomains)) continue;

    const dedupeKey = cleanedUrl.replace(/\/$/, "");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    filtered.push({ ...candidate, url: cleanedUrl });
  }

  return filtered.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
}

function cacheDirectory(): string {
  return process.env.WEB_SEARCH_CACHE_DIR || path.join(process.cwd(), ".cache", "web-search");
}

function cacheTtlMs(): number {
  return readNumberEnv("WEB_SEARCH_CACHE_TTL_HOURS", DEFAULT_CACHE_TTL_HOURS, 0, 24 * 30) * 60 * 60 * 1000;
}

function cacheKey(input: {
  query: string;
  providerOrder: LocalWebSearchProvider[];
  allowedDomains: string[];
  blockedDomains: string[];
  maxResults: number;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        query: input.query,
        providerOrder: input.providerOrder,
        allowedDomains: input.allowedDomains,
        blockedDomains: input.blockedDomains,
        maxResults: input.maxResults,
      }),
    )
    .digest("hex");
}

async function readCache(key: string): Promise<LocalWebSearchResponse | null> {
  const ttlMs = cacheTtlMs();
  if (ttlMs <= 0) return null;

  try {
    const raw = await fs.readFile(path.join(cacheDirectory(), `${key}.json`), "utf8");
    const parsed = JSON.parse(raw) as LocalWebSearchResponse;
    if (Date.now() - Date.parse(parsed.generatedAt) > ttlMs) return null;
    return { ...parsed, cached: true };
  } catch {
    return null;
  }
}

async function writeCache(key: string, response: LocalWebSearchResponse): Promise<void> {
  if (cacheTtlMs() <= 0) return;
  try {
    await fs.mkdir(cacheDirectory(), { recursive: true });
    await fs.writeFile(path.join(cacheDirectory(), `${key}.json`), JSON.stringify(response), "utf8");
  } catch {
    // Search should still work even when the local cache directory is read-only.
  }
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(12_000),
    headers: {
      Accept: "text/html,application/xhtml+xml,application/json",
      "User-Agent": "EscbaseReadLocalSearch/1.0",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function searxngUrl(query: string): string {
  const base = process.env.SEARXNG_URL || process.env.WEB_SEARCH_SEARXNG_URL;
  if (!base) throw new Error("Thiếu SEARXNG_URL.");
  const url = new URL("/search", base);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "auto");
  url.searchParams.set("safesearch", "1");
  return url.toString();
}

async function searchSearxng(query: string, maxResults: number): Promise<SearchCandidate[]> {
  const raw = await fetchText(searxngUrl(query), { headers: { Accept: "application/json" } });
  const parsed = JSON.parse(raw) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  return (parsed.results || [])
    .slice(0, Math.max(maxResults * 3, 10))
    .flatMap((result, index): SearchCandidate[] => {
      if (!result.url || !result.title) return [];
      return [
        {
          title: cleanText(result.title, 220),
          url: result.url,
          snippet: cleanText(result.content || ""),
          provider: "searxng",
          rank: index,
        },
      ];
    });
}

async function searchBrave(query: string, maxResults: number): Promise<SearchCandidate[]> {
  const token = process.env.BRAVE_SEARCH_API_KEY;
  if (!token) throw new Error("Thiếu BRAVE_SEARCH_API_KEY.");

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(20, Math.max(maxResults * 3, 10))));
  url.searchParams.set("safesearch", "moderate");

  const raw = await fetchText(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": token,
    },
  });
  const parsed = JSON.parse(raw) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  return (parsed.web?.results || []).flatMap((result, index): SearchCandidate[] => {
    if (!result.url || !result.title) return [];
    return [
      {
        title: cleanText(result.title, 220),
        url: result.url,
        snippet: cleanText(result.description || ""),
        provider: "brave",
        rank: index,
      },
    ];
  });
}

function decodeDuckDuckGoUrl(value: string): string | null {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : url.toString();
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchCandidate[]> {
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const html = await fetchText(url.toString());
  const $ = cheerio.load(html);
  const candidates: SearchCandidate[] = [];

  $(".result").each((index, element) => {
    const link = $(element).find("a.result__a").first();
    const href = link.attr("href");
    const decodedUrl = href ? decodeDuckDuckGoUrl(href) : null;
    const title = cleanText(link.text(), 220);
    if (!decodedUrl || !title) return;

    candidates.push({
      title,
      url: decodedUrl,
      snippet: cleanText($(element).find(".result__snippet").text()),
      provider: "duckduckgo",
      rank: index,
    });
  });

  return candidates.slice(0, Math.max(maxResults * 3, 10));
}

function configuredProviderOrder(): LocalWebSearchProvider[] {
  const provider = (process.env.WEB_SEARCH_PROVIDER || "auto").trim().toLowerCase();
  if (provider === "disabled" || provider === "off") return [];
  if (provider === "searxng") return ["searxng", "duckduckgo"];
  if (provider === "brave") return ["brave", "duckduckgo"];
  if (provider === "duckduckgo") return ["duckduckgo"];

  const order: LocalWebSearchProvider[] = [];
  if (process.env.SEARXNG_URL || process.env.WEB_SEARCH_SEARXNG_URL) order.push("searxng");
  if (process.env.BRAVE_SEARCH_API_KEY) order.push("brave");
  order.push("duckduckgo");
  return order;
}

async function searchWithProvider(
  provider: LocalWebSearchProvider,
  query: string,
  maxResults: number,
): Promise<SearchCandidate[]> {
  if (provider === "searxng") return searchSearxng(query, maxResults);
  if (provider === "brave") return searchBrave(query, maxResults);
  return searchDuckDuckGo(query, maxResults);
}

async function hydrateCandidate(candidate: SearchCandidate): Promise<LocalWebSearchResult> {
  let title = candidate.title;
  let url = candidate.url;
  let text = "";

  try {
    const page = await readWebPage(candidate.url);
    title = page.title || title;
    url = page.url;
    text = page.text.slice(0, PAGE_TEXT_LIMIT);
  } catch {
    // Keep the search hit and snippet even when the page blocks scraping or is not HTML.
  }

  const publisher = getHostname(url);
  return {
    title,
    url,
    publisher,
    snippet: candidate.snippet,
    text,
    sourceQuality: sourceQuality(publisher),
    score: scoreCandidate({ ...candidate, url }),
  };
}

export async function localWebSearch(input: LocalWebSearchInput): Promise<LocalWebSearchResponse> {
  const query = cleanText(input.query, QUERY_LIMIT);
  const maxResults = clampMaxResults(input.maxResults);
  const allowedDomains = (input.allowedDomains || []).flatMap((domain) => {
    const normalized = normalizeDomain(domain);
    return normalized ? [normalized] : [];
  });
  const blockedDomains = (input.blockedDomains || []).flatMap((domain) => {
    const normalized = normalizeDomain(domain);
    return normalized ? [normalized] : [];
  });
  const providerOrder = configuredProviderOrder();
  const errors: string[] = [];

  if (!query) {
    return {
      query,
      provider: "none",
      cached: false,
      generatedAt: new Date().toISOString(),
      results: [],
      errors: ["Truy vấn tìm kiếm rỗng."],
    };
  }

  if (!providerOrder.length) {
    return {
      query,
      provider: "none",
      cached: false,
      generatedAt: new Date().toISOString(),
      results: [],
      errors: ["Local web search đang bị tắt bằng WEB_SEARCH_PROVIDER=disabled."],
    };
  }

  const key = cacheKey({ query, providerOrder, allowedDomains, blockedDomains, maxResults });
  const cached = await readCache(key);
  if (cached) return cached;

  let provider: LocalWebSearchProvider | "none" = "none";
  let candidates: SearchCandidate[] = [];

  for (const candidateProvider of providerOrder) {
    try {
      candidates = await searchWithProvider(candidateProvider, query, maxResults);
      if (candidates.length) {
        provider = candidateProvider;
        break;
      }
      errors.push(`${candidateProvider}: không có kết quả.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "lỗi không rõ";
      errors.push(`${candidateProvider}: ${message}`);
    }
  }

  const filtered = filterAndRankCandidates(candidates, allowedDomains, blockedDomains).slice(0, maxResults);
  const settled = await Promise.allSettled(filtered.map((candidate) => hydrateCandidate(candidate)));
  const results = settled.flatMap((item) => (item.status === "fulfilled" ? [item.value] : []));

  const response: LocalWebSearchResponse = {
    query,
    provider,
    cached: false,
    generatedAt: new Date().toISOString(),
    results,
    errors,
  };

  await writeCache(key, response);
  return response;
}
