import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "나비스",
  description: "나의 완벽한 비서",
  // 아이폰 "홈 화면에 추가"로 열 때 주소창 없이 앱처럼 뜬다. 아이콘은 app/apple-icon.png.
  appleWebApp: { capable: true, title: "나비스", statusBarStyle: "black" },
};

// 설치한 앱의 제목 표시줄 · 모바일 상태 표시줄 색. manifest 의 theme_color 와 같다.
export const viewport: Viewport = { themeColor: "#0d0e1a" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ko"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-dvh flex-col overflow-hidden">
        <QueryProvider>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster closeButton />
        </QueryProvider>
      </body>
    </html>
  );
}
