"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// 다크가 기본 경험이라(layout.tsx 의 <html class="dark">) next-themes 없이 테마를 고정한다.
// 색은 디자인 토큰을 그대로 쓴다 — 토스트만 다른 팔레트로 뜨지 않게.
export const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};
