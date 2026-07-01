// Pure hostname matching only — no Node-only imports (node:net, node:dns)
// so this stays safe to import from both server code and client components
// (e.g. the analyzer form uses this to pick video-specific loading copy).
import type { VideoPlatform } from "@/lib/types";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const TIKTOK_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

const FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "fb.watch",
]);

export function detectVideoPlatform(value: string): VideoPlatform | null {
  let hostname: string;
  try {
    hostname = new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (YOUTUBE_HOSTS.has(hostname)) return "youtube";
  if (TIKTOK_HOSTS.has(hostname)) return "tiktok";
  if (FACEBOOK_HOSTS.has(hostname)) return "facebook";
  return null;
}
