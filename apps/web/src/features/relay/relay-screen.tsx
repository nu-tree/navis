"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/apis/me/use-me";
import { useRelayList } from "@/hooks/apis/relay/use-relay-list";
import { useRelayComposer } from "@/hooks/pages/relay/use-relay-composer";
import { RelayForm } from "./relay-form";
import { RelayList } from "./relay-list";

/**
 * 말 걸기 — 관리자가 회원의 나비스에게 전할 말을 맡기는 화면(specs/004).
 * 관리자가 아니면 아무것도 불러오지 않는다. 실제 잠금은 server 의 403 이다.
 */
export const RelayScreen = () => {
  const admin = useIsAdmin();
  const composer = useRelayComposer(admin);
  const list = useRelayList(admin);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft />
            대화
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">말 걸기</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
          {admin ? (
            <>
              <RelayForm composer={composer} />
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">보낸 기록</h2>
                <RelayList
                  items={list.data ?? []}
                  isLoading={list.isLoading}
                  error={list.error}
                  onResend={composer.resend}
                />
              </section>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">관리자만 쓸 수 있어요.</p>
          )}
        </div>
      </div>
    </div>
  );
};
