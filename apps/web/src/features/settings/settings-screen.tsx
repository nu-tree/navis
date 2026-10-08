"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClaudeTokenForm } from "./claude-token-form";

/** 설정 화면 — 지금은 Claude 연결 하나. 화면 상한은 채팅 · 기억 · 설정 셋이다(SC-010). */
export const SettingsScreen = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft />
            대화
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">설정</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          <ClaudeTokenForm />
        </div>
      </div>
    </div>
  );
};
