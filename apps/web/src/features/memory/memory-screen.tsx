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
          {/* 초대한 회원이 "꼬일까봐" 기억을 전부 지운 일이 있었다(2026-10). 비우는 화면이 아니라 바로잡는 화면이다. */}
          <p className="mb-4 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            기억은 나만 보고, 다른 사람이나 다른 주제와 섞이지 않아요. 쌓일수록 나비스가 나를 더 잘 알아요 —
            <b className="font-semibold text-foreground"> 틀린 게 보이면 연필 버튼으로 고쳐 주세요.</b>
          </p>
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
