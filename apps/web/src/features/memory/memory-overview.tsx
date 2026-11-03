"use client";

import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import type { Category } from "@navis/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kstDayKey, weekdayOfKey } from "@/utils/day-groups";
import { OverviewDecisionCard } from "./overview-decision-card";
import { OverviewLearningCard } from "./overview-learning-card";
import { OverviewTodoCard } from "./overview-todo-card";
import { OverviewWeekCard } from "./overview-week-card";

type Props = {
  /** 목록 탭으로 — 분류 · 기간을 걸고 넘어간다. 아무것도 안 주면 전체. */
  onBrowse: (filter?: { category?: Category; recentWeek?: boolean }) => void;
  /** 목록 탭으로 넘어가 의미 검색. */
  onSearch: (text: string) => void;
  onTodos: () => void;
};

/**
 * 기억 화면 첫 탭 "한눈에" — 들어오자마자 최근 결정 · 남은 할 일 · 이번 주 · 최근에 알게 된 것이 한 화면에 보인다.
 * 찾고 고치는 일은 "전체 목록" 탭의 몫이고, 여기는 보고 넘어가는 자리다.
 */
export const MemoryOverview = ({ onBrowse, onSearch, onTodos }: Readonly<Props>) => {
  const [draft, setDraft] = useState("");
  const today = kstDayKey(new Date());

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {today.replaceAll("-", ".")} ({weekdayOfKey(today)})
          </span>
          <h1 className="text-3xl leading-tight font-bold tracking-[-0.04em] md:text-4xl">나비스가 아는 것</h1>
          {/* 초대한 회원이 "꼬일까봐" 기억을 전부 지운 일이 있었다(2026-10). 비우는 화면이 아니라 바로잡는 화면이다. */}
          <p className="text-sm leading-relaxed text-muted-foreground">
            기억은 나만 봐요. 틀린 게 보이면 고쳐 주세요 — 쌓일수록 나비스가 나를 더 잘 알아요.
          </p>
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) onSearch(draft);
          }}
          className="relative w-full sm:w-96"
        >
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="기억 검색"
            placeholder="의미로 찾기 — 예: 배포 결정 이유"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-11 rounded-xl pl-10"
          />
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <OverviewDecisionCard className="lg:col-span-7" onMore={() => onBrowse({ category: "decision" })} />
        <OverviewTodoCard className="lg:col-span-5" onMore={onTodos} />
        <OverviewWeekCard
          className="lg:col-span-7"
          onPick={(category) => onBrowse({ category, recentWeek: true })}
        />
        <OverviewLearningCard className="lg:col-span-5" onMore={() => onBrowse({ category: "learning" })} />
      </div>

      <Button variant="outline" className="h-11 self-center rounded-full px-5" onClick={() => onBrowse()}>
        전체 목록 보기
        <ArrowRight />
      </Button>
    </div>
  );
};
