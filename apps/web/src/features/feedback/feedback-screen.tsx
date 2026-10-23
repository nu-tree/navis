"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/apis/me/use-me";
import { useFeedbackList } from "@/hooks/apis/feedback/use-feedback-list";
import { useSetFeedbackDone } from "@/hooks/apis/feedback/use-set-feedback-done";
import { FeedbackList } from "./feedback-list";

/**
 * 피드백 — 회원이 나비스에게 말한 개선점을 관리자가 모아 보는 화면.
 * 관리자 대화방 · 알림으로는 오지 않는다 — 여기서만 본다(2026-10-23 사용자 결정).
 * 관리자가 아니면 아무것도 불러오지 않는다. 실제 잠금은 server 의 403 이다.
 */
export const FeedbackScreen = () => {
  const admin = useIsAdmin();
  const list = useFeedbackList(admin);
  const { mutate: setDone } = useSetFeedbackDone();
  const open = list.data?.filter((f) => !f.done).length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft />
            대화
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">피드백</h1>
        {open ? <span className="text-xs text-muted-foreground">처리 안 함 {open}개</span> : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          {admin ? (
            <FeedbackList
              items={list.data ?? []}
              isLoading={list.isLoading}
              error={list.error}
              onToggle={(item, done) => setDone({ id: item.id, done })}
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">관리자만 볼 수 있어요.</p>
          )}
        </div>
      </div>
    </div>
  );
};
