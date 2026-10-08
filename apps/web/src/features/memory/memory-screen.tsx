"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemoryBrowser } from "@/hooks/pages/memory/use-memory-browser";
import { MemoryExportButton } from "./memory-export-button";
import { MemoryFilters } from "./memory-filters";
import { MemoryList } from "./memory-list";
import { TodoList } from "./todo-list";

/** 기억 화면 — 목록 · 검색 · 할 일 · 내보내기를 한 화면에 둔다(세 화면 상한, SC-010). */
export const MemoryScreen = () => {
  const browser = useMemoryBrowser();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft />
            대화
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">기억</h1>
        <div className="flex-1" />
        <MemoryExportButton />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <Tabs defaultValue="all">
            <TabsList className="mb-4">
              <TabsTrigger value="all">전체</TabsTrigger>
              <TabsTrigger value="todo">할 일</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              <MemoryFilters browser={browser} />
              <MemoryList
                items={browser.items}
                isLoading={browser.isLoading}
                error={browser.error}
                emptyText={browser.searching ? "관련된 기억이 없어요." : "아직 기억이 없어요."}
                hasMore={browser.hasMore}
                loadingMore={browser.loadingMore}
                onLoadMore={browser.loadMore}
              />
            </TabsContent>

            <TabsContent value="todo">
              <TodoList />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
