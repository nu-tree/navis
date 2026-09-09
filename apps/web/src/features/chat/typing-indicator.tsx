"use client";

import { useEffect, useState } from "react";

// 응답 대기 표시. 세 가지를 보여준다:
//   ① 무언가 돌고 있다 (점 애니메이션)
//   ② 지금 무엇을 하는지 (도구 상태 — 서버의 status 이벤트)
//   ③ 얼마나 기다렸는지 (경과 시간)
//
// ③ 이 중요하다. 에이전트 턴은 도구 루프 때문에 수십 초가 걸릴 수 있고, 그때
// 경과 시간이 없으면 "멈춘 건가?" 를 판단할 근거가 사용자에게 없다.
export function TypingIndicator({
  status,
  startedAt,
}: {
  /** 진행 중인 작업 한 줄. 없으면 "생각하는 중". */
  status?: string;
  startedAt: number;
}) {
  const elapsed = useElapsedSeconds(startedAt);

  return (
    <div className="flex items-center gap-2.5 text-muted-foreground">
      <Dots />
      <span className="text-[13px]">{status ?? "생각하는 중"}</span>
      {/* 3초 전에는 숨긴다 — 빠른 응답에 숫자가 깜빡이면 산만하다. */}
      {elapsed >= 3 && (
        <span className="text-[13px] tabular-nums opacity-60">{elapsed}초</span>
      )}
    </div>
  );
}

function Dots() {
  return (
    <span className="flex gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function useElapsedSeconds(startedAt: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // 1초 간격이면 표시가 최대 1초 늦게 넘어간다. 500ms 로 돌려 체감을 맞춘다.
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  return Math.floor((now - startedAt) / 1000);
}
