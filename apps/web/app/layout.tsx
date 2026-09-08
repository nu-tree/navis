import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "navis",
  description: "제2의 뇌 — 기억(namory) + 에이전트(navis)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          background: "#0b0b10",
          color: "#e8e8ee",
        }}
      >
        {children}
      </body>
    </html>
  );
}
