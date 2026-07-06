import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Newsreader } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const sans = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const serif = Newsreader({
  variable: "--font-serif",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://fast.escbase.xyz"),
  applicationName: "Fast Escbase",
  title: {
    default: "Fast Escbase",
    template: "%s | Fast Escbase",
  },
  description: "Đọc nhanh video ngắn TikTok, Facebook Reel, YouTube Short bằng AI: tóm tắt và kiểm chứng đúng sai.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Fast Escbase",
    description: "Đọc nhanh video ngắn TikTok, Facebook Reel, YouTube Short bằng AI: tóm tắt và kiểm chứng đúng sai.",
    url: "https://fast.escbase.xyz",
    siteName: "Fast Escbase",
    locale: "vi_VN",
    type: "website",
    images: [
      {
        url: "/escbase-read-og.png",
        width: 1200,
        height: 630,
        alt: "Fast Escbase - Đọc nhanh Video ngắn",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fast Escbase",
    description: "Đọc nhanh video ngắn TikTok, Facebook Reel, YouTube Short bằng AI: tóm tắt và kiểm chứng đúng sai.",
    images: ["/escbase-read-og.png"],
  },
  other: {
    "format-detection": "telephone=no",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eee8d7",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={`${sans.variable} ${serif.variable}`}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
