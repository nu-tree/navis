"use client";

import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import type { PlanUsage } from "@navis/validation";
import { Skeleton } from "@/components/ui/skeleton";
import { useClaudeTokenStatus } from "@/hooks/apis/settings/use-claude-token-status";
import { usePlanUsage } from "@/hooks/apis/settings/use-plan-usage";
import { cn } from "cn";

type Window = NonNullable<PlanUsage["fiveHour"]>;

const formatResetsAt = (iso: string, now: number) => {
  const at = new Date(iso);
  const sameDay = at.toDateString() === new Date(now).toDateString();
  return sameDay
    ? at.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })
    : at.toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
};

const formatAgo = (iso: string, now: number) => {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / (60 * 24))}일 전`;
};

/** 지금 시각 — 1분마다 다시 그린다. 화면을 켜 둔 채 초기화 시각이 지나도 맞게 보이게. */
const useNow = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
};

/** 한 창(5시간 · 주간). 초기화 시각이 지났으면 받은 값은 이미 의미가 없다 — 숫자 대신 그렇게 말한다. */
const WindowRow = ({ label, window, now }: { label: string; window: Window; now: number }) => {
  const reset = new Date(window.resetsAt).getTime() <= now;
  // 받은 값은 0~1 비율이다. 계산 없이 %로만 바꾼다.
  const percent = Math.round(window.utilization * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("tabular-nums", !reset && percent >= 90 && "text-destructive")}>
          {reset ? "초기화됨" : `${percent}% 사용`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", percent >= 90 ? "bg-destructive" : "bg-primary")}
          style={{ width: `${reset ? 0 : Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {reset ? "다음 대화 때 새 값을 받아요." : `${formatResetsAt(window.resetsAt, now)} 초기화`}
      </p>
    </div>
  );
};

/**
 * Claude 요금제 한도 — claude.ai 의 '사용 한도'와 같은 값이다. 나비스로 대화할 때 받은 마지막 값을
 * 그대로 보여 준다(계산하지 않는다). 토큰이 없으면 보여 줄 것이 없어 카드를 숨긴다.
 */
export const PlanUsageCard = () => {
  const { data: token } = useClaudeTokenStatus();
  const { data: usage, isLoading, error } = usePlanUsage();
  const now = useNow();
  if (!token?.registered) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/40 p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">Claude 사용량</h2>
        <p className="text-sm text-muted-foreground">
          내 Claude 요금제 한도예요. 나비스뿐 아니라 claude.ai · Claude Code 에서 쓴 것까지 모두 들어가요.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error.message}
        </p>
      ) : !usage || (!usage.fiveHour && !usage.sevenDay) ? (
        <p className="text-sm text-muted-foreground">나비스와 한 번 대화하면 여기에 보여요.</p>
      ) : (
        <>
          <div className="space-y-4">
            {usage.fiveHour && <WindowRow label="5시간 한도" window={usage.fiveHour} now={now} />}
            {usage.sevenDay && <WindowRow label="주간 한도" window={usage.sevenDay} now={now} />}
          </div>
          <p className="text-xs text-muted-foreground">
            나비스와 마지막으로 대화할 때 받은 값이에요 · {formatAgo(usage.observedAt, now)}
          </p>
        </>
      )}
    </section>
  );
};
