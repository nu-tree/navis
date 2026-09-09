import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "navis",
  description: "제2의 뇌 — 기억하고 대화한다",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `dark` 를 박아 다크를 기본으로 한다. shadcn 규약이 `:root`=라이트 /
    // `.dark`=다크 라서, 다크가 기본인 이 디자인에서는 여기서 켜 주는 게 맞다.
    // (테마 토글을 붙일 때 이 클래스를 스크립트로 갈아끼우고 html 에
    //  suppressHydrationWarning 을 추가한다.)
    <html
      lang="ko"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* 채팅 화면은 페이지가 스크롤되면 안 된다 — 메시지 목록이 자기 안에서
          스크롤하고 입력창은 바닥에 고정돼야 한다. 그래서 body 높이를 뷰포트에
          묶고 overflow 를 잠근다. h-dvh 는 모바일 브라우저 UI 가 접힐 때의
          높이 변화를 따라간다(h-screen 은 그걸 못 따라가 입력창이 가려진다). */}
      <body className="flex h-dvh flex-col overflow-hidden">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
