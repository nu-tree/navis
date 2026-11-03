"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Category } from "@navis/validation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemoryBrowser } from "@/hooks/pages/memory/use-memory-browser";
import { MemoryExportButton } from "./memory-export-button";
import { MemoryFilters } from "./memory-filters";
import { MemoryList } from "./memory-list";
import { MemoryOverview } from "./memory-overview";
import { TodoList } from "./todo-list";
import { WEEK_DAYS } from "./overview-week-card";

type Tab = "overview" | "all" | "todo";

/** 기억 화면 — 한눈에 · 전체 목록 · 할 일. 내보내기는 머리줄에(세 화면 상한, SC-010). */
export const MemoryScreen = () => {
  const browser = useMemoryBrowser();
  const [tab, setTab] = useState<Tab>("overview");

  const browse = (filter: { category?: Category; recentWeek?: boolean } = {}) => {
    browser.clearSearch();
    browser.setCategory(filter.category ?? "all");
    browser.setPeriod(filter.recentWeek ? (String(WEEK_DAYS) as typeof browser.period) : "all");
    setTab("all");
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col gap-0">
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border px-2 md:px-4">
        <div className="flex items-center">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft />
              <span className="max-sm:sr-only">대화</span>
            </Link>
          </Button>
        </div>
        <TabsList aria-label="기억 보기" className="h-9! rounded-xl border border-border bg-card p-1">
          <TabsTrigger value="overview" className="rounded-lg px-3">한눈에</TabsTrigger>
          <TabsTrigger value="all" className="rounded-lg px-3">전체 목록</TabsTrigger>
          <TabsTrigger value="todo" className="rounded-lg px-3">할 일</TabsTrigger>
        </TabsList>
        <div className="flex justify-end">
          <MemoryExportButton />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="overview" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 md:px-8 md:pt-10">
          <MemoryOverview
            onBrowse={browse}
            onSearch={(text) => {
              browser.search(text);
              setTab("all");
            }}
            onTodos={() => setTab("todo")}
          />
        </TabsContent>

        <TabsContent value="all" className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
          <MemoryFilters browser={browser} />
          <MemoryList
            items={browser.items}
            isLoading={browser.isLoading}
            error={browser.error}
            emptyText={browser.searching ? "관련된 기억이 없어요." : "아직 기억이 없어요."}
            byDay={!browser.searching}
            hasMore={browser.hasMore}
            loadingMore={browser.loadingMore}
            onLoadMore={browser.loadMore}
          />
        </TabsContent>

        <TabsContent value="todo" className="mx-auto w-full max-w-3xl px-4 py-6">
          <TodoList />
        </TabsContent>
      </div>
    </Tabs>
  );
};
