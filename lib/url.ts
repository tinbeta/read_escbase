import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);

export function isXStatusUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return X_HOSTS.has(url.hostname.toLowerCase()) && /\/status\/\d+/.test(url.pathname);
  } catch {
    return false;
  }
}

export function extractTweetId(value: string): string {
  const match = new URL(value).pathname.match(/\/status\/(\d+)/);
  if (!match) {
    throw new Error("Không tìm thấy ID bài đăng X trong đường dẫn.");
  }
  return match[1];
}

export function normalizeSourceUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";

  if (isXStatusUrl(value)) {
    return `https://x.com/i/status/${extractTweetId(value)}`;
  }

  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || ["fbclid", "gclid"].includes(key)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

function isPrivateIp(address: string): boolean {
  const normalized = address.replace(/^::ffff:/, "");
  if (normalized === "::1" || normalized === "0.0.0.0" || normalized === "127.0.0.1") {
    return true;
  }

  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  const lower = normalized.toLowerCase();
  return (
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  );
}

export async function assertPublicUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Đường dẫn không được hỗ trợ.");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("Không thể đọc địa chỉ nội bộ.");
  }

  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("Không thể đọc địa chỉ nội bộ.");
  }

  return url;
}
