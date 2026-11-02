"use client";

import { CATEGORIES, type Category } from "@navis/validation";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemorySummary } from "@/hooks/apis/memory/use-memory-summary";
import type { useMemoryBrowser } from "@/hooks/pages/memory/use-memory-browser";
import { cn } from "cn";
import { CATEGORY_LABELS } from "./category";

/** 요약이 보는 기간. 기간 필터의 "최근 7일"과 같다 — 누르면 그 필터로 바뀐다. */
const SUMMARY_DAYS = 7;

type Props = { browser: ReturnType<typeof useMemoryBrowser> };

/**
 * 기억 화면 맨 위 — "최근 7일 · 결정 3 · 할 일 5 …". 묻기 전에 요즘 무엇이 쌓였는지 한눈에 본다.
 * 분류를 누르면 목록이 최근 7일 · 그 분류로 걸러진다. 한 번 더 누르면 풀린다.
 */
export const MemorySummary = ({ browser }: Readonly<Props>) => {
  const { data, isLoading } = useMemorySummary(SUMMARY_DAYS);

  if (isLoading) return <Skeleton className="h-16 w-full rounded-xl" />;
  if (!data) return null;

  const chips = CATEGORIES.filter((c) => (data.byCategory[c] ?? 0) > 0);
  const filtered = browser.period === String(SUMMARY_DAYS);

  const pick = (category: Category) => {
    const active = filtered && browser.category === category;
    browser.setCategory(active ? "all" : category);
    browser.setPeriod(active ? "all" : (String(SUMMARY_DAYS) as typeof browser.period));
  };

  return (
    <section className="rounded-xl border border-border bg-card/40 px-4 py-3">
      <p className="text-sm">
        최근 {SUMMARY_DAYS}일 동안 기억 <b className="font-semibold">{data.total}개</b>
        {data.total === 0 ? " — 대화하면 알아서 쌓여요." : "가 쌓였어요."}
      </p>
      {chips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const active = filtered && browser.category === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => pick(c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {CATEGORY_LABELS[c]} {data.byCategory[c]}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
};
