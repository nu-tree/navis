import type { ReactNode } from "react";
import { StringLights } from "@/components/decor/winter-scene";

type Props = {
  /** 위쪽 바. 슬롯으로 받는다 — 셸이 바의 내용을 알 필요가 없다. */
  header: ReactNode;
  children: ReactNode;
};

export function AppShell({ header, children }: Readonly<Props>) {
  return (
    // 목록만 스크롤하고 입력창은 바닥에 고정되려면 이 열의 높이가 화면에 묶여야 한다 —
    // min-h-0 이 없으면 내용만큼 늘어난다.
    <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
      {header}
      {/* 위쪽 바 바로 아래 걸린 전구 줄(겨울 밤 테마). 누르기를 가로막지 않는다. */}
      {/* 아래로 옅어지는 띠를 함께 깐다 — 위로 스크롤된 글이 전구 뒤로 스며들 듯 사라져 겹쳐 읽히지 않는다. */}
      <div className="pointer-events-none absolute inset-x-0 top-14 z-20 h-14 overflow-hidden bg-linear-to-b from-background via-background/80 to-transparent md:top-16">
        <StringLights className="-mt-1" />
      </div>
      {children}
    </div>
  );
}
