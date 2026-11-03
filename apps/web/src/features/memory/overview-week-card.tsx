"use client";

import { CATEGORIES, type Category } from "@navis/validation";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemorySummary } from "@/hooks/apis/memory/use-memory-summary";
import { kstDayKey, weekdayOfKey } from "@/utils/day-groups";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "./category";
import { CategoryDot, OverviewCard } from "./overview-card";

/** 보는 기간. 목록의 기간 필터 "최근 7일"과 같다 — 범례를 누르면 그 필터로 넘어간다. */
export const WEEK_DAYS = 7;

const KEYS = [...CATEGORIES, "none"] as const;
const labelOf = (key: Category | "none") => (key === "none" ? "분류 없음" : CATEGORY_LABELS[key]);

type Props = { onPick: (category: Category) => void; className?: string };

/** 최근 7일 막대 — 날마다 분류별로 쌓는다. 범례(분류 · 개수)를 누르면 그 분류 · 7일 목록으로. */
export const OverviewWeekCard = ({ onPick, className }: Readonly<Props>) => {
  const { data, isLoading } = useMemorySummary(WEEK_DAYS);
  const today = kstDayKey(new Date());

  const days = (data?.byDay ?? []).map((d) => {
    const parts = KEYS.flatMap((key) => {
      const n = d.byCategory[key] ?? 0;
      return n > 0 ? [{ key, n }] : [];
    });
    return { date: d.date, parts, total: parts.reduce((s, p) => s + p.n, 0) };
  });
  const max = Math.max(1, ...days.map((d) => d.total));
  const legend = CATEGORIES.filter((c) => (data?.byCategory[c] ?? 0) > 0);
  const described = days.map((d) => `${d.date === today ? "오늘" : weekdayOfKey(d.date)} ${d.total}개`).join(", ");

  return (
    <OverviewCard label={data ? `최근 ${WEEK_DAYS}일 · ${data.total}개` : `최근 ${WEEK_DAYS}일`} className={className}>
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !data ? null : (
        <>
          <div role="img" aria-label={`최근 ${WEEK_DAYS}일 기억 수: ${described}`} className="grid h-36 grid-cols-7 gap-2.5">
            {days.map((d) => (
              <div key={d.date} className="flex min-w-0 flex-col items-center gap-1.5">
                <span className="font-mono text-[11px] text-muted-foreground">{d.total > 0 ? d.total : ""}</span>
                <div className="flex w-full max-w-11 flex-1 flex-col justify-end gap-[3px]">
                  {d.total === 0 ? (
                    <span className="h-1 rounded-[3px] bg-border" />
                  ) : (
                    d.parts.map((p) => (
                      <span
                        key={p.key}
                        className="min-h-1 rounded-[4px]"
                        style={{ height: `${(p.n / max) * 100}%`, background: CATEGORY_COLORS[p.key] }}
                      />
                    ))
                  )}
                </div>
                <span className={d.date === today ? "text-[11px] text-foreground" : "text-[11px] text-muted-foreground"}>
                  {d.date === today ? "오늘" : weekdayOfKey(d.date)}
                </span>
              </div>
            ))}
          </div>

          {legend.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {legend.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onPick(c)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs text-foreground/80 transition-colors hover:border-input hover:bg-muted"
                >
                  <CategoryDot color={CATEGORY_COLORS[c]} />
                  {labelOf(c)} {data.byCategory[c]}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">이번 주엔 아직 쌓인 기억이 없어요. 대화하면 알아서 쌓여요.</p>
          )}
        </>
      )}
    </OverviewCard>
  );
};
