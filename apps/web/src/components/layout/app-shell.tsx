import type { ReactNode } from "react";

type Props = {
  /** 위쪽 바. 슬롯으로 받는다 — 셸이 바의 내용을 알 필요가 없다. */
  header: ReactNode;
  children: ReactNode;
};

export function AppShell({ header, children }: Readonly<Props>) {
  return (
    // 목록만 스크롤하고 입력창은 바닥에 고정되려면 이 열의 높이가 화면에 묶여야 한다 —
    // min-h-0 이 없으면 내용만큼 늘어난다.
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {children}
    </div>
  );
}
