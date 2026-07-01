import type { Metadata } from "next";
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
  metadataBase: new URL("https://read.escbase.xyz"),
  title: {
    default: "Fast Escbase",
    template: "%s | Fast Escbase",
  },
  description: "Đọc nhanh video ngắn TikTok, Facebook Reel, YouTube Short bằng AI: tóm tắt và kiểm chứng đúng sai.",
  openGraph: {
    title: "Fast Escbase",
    description: "Đọc nhanh video ngắn TikTok, Facebook Reel, YouTube Short bằng AI: tóm tắt và kiểm chứng đúng sai.",
    url: "https://read.escbase.xyz",
    siteName: "Fast Escbase",
    locale: "vi_VN",
    type: "website",
    images: [
      {
        url: "/escbase-read-og.png",
        width: 1200,
        height: 630,
        alt: "Fast Escbase",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fast Escbase",
    description: "Đọc nhanh video ngắn TikTok, Facebook Reel, YouTube Short bằng AI: tóm tắt và kiểm chứng đúng sai.",
    images: ["/escbase-read-og.png"],
  },
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
