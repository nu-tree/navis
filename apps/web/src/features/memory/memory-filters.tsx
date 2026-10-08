"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { CATEGORIES, type Category } from "@navis/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemoryProjectList } from "@/hooks/apis/memory/use-memory-project-list";
import {
  PERIODS,
  PROJECT_ALL,
  PROJECT_PERSONAL,
  type Period,
  type useMemoryBrowser,
} from "@/hooks/pages/memory/use-memory-browser";
import { CATEGORY_LABELS } from "./category";
import { ProjectManager } from "./project-manager";

type Props = { browser: ReturnType<typeof useMemoryBrowser> };

export const MemoryFilters = ({ browser }: Readonly<Props>) => {
  const { data: projects = [] } = useMemoryProjectList();
  // 입력 중인 검색어. 제출해야 검색한다 — 글자마다 임베딩을 부르지 않는다.
  const [draft, setDraft] = useState(browser.query);

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          browser.search(draft);
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="의미로 찾기 — 예: 배포 결정 이유"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-10 pr-10 pl-9"
        />
        {browser.searching ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="검색 지우기"
            onClick={() => {
              setDraft("");
              browser.clearSearch();
            }}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 active:not-aria-[haspopup]:-translate-y-1/2"
          >
            <X />
          </Button>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2">
        <Select value={browser.category} onValueChange={(v) => browser.setCategory(v as Category | "all")}>
          <SelectTrigger aria-label="분류" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 분류</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={browser.project} onValueChange={browser.setProject}>
          <SelectTrigger aria-label="프로젝트" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PROJECT_ALL}>모든 프로젝트</SelectItem>
            <SelectItem value={PROJECT_PERSONAL}>개인 기억만</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.project} value={p.project}>
                {p.project} · {p.count}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 의미 검색은 기간 대신 최근일수록 위로 올린다 — 검색 중엔 기간 필터를 숨긴다. */}
        {browser.searching ? null : (
          <Select value={browser.period} onValueChange={(v) => browser.setPeriod(v as Period)}>
            <SelectTrigger aria-label="기간" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex-1" />
        {/* 필터가 옛 이름을 보고 있었으면 새 이름으로 따라간다 — 안 그러면 빈 목록이 된다. */}
        <ProjectManager onRenamed={(from, to) => browser.project === from && browser.setProject(to)} />
      </div>
    </div>
  );
};
