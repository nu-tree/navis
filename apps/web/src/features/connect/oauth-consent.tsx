"use client";

import Link from "next/link";
import { AlertCircle, BookOpen, Loader2, PenLine, Search, ShieldCheck } from "lucide-react";
import type { OAuthAuthorizeInput } from "@navis/validation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApproveOAuth } from "@/hooks/apis/oauth/use-approve-oauth";
import { useOAuthClient } from "@/hooks/apis/oauth/use-oauth-client";

/** 허용하면 그 앱이 할 수 있는 일 — 외부 MCP 가 노출하는 기억 도구 그대로다. */
const ABILITIES = [
  { icon: Search, text: "내 기억을 찾아보고 최근 기억 · 할 일을 봐요" },
  { icon: PenLine, text: "대화 중 기억할 만한 것을 내 나비스에 남겨요" },
  { icon: BookOpen, text: "틀린 기억을 고치거나 지워요" },
];

/**
 * "Claude 가 내 나비스에 연결하려고 해요 — 허용할까요?"
 * 거절하면 그냥 나비스로 돌아간다 — 앱 쪽 창은 닫으면 된다. 돌아갈 주소로 보내지 않는 이유: 그 주소가
 * 등록된 것인지는 허용할 때 서버가 확인한다. 확인 전에 그리로 보내면 열린 리다이렉트가 된다.
 */
export const OAuthConsent = ({ input }: Readonly<{ input: OAuthAuthorizeInput }>) => {
  const { data: client, isLoading, error } = useOAuthClient(input.client_id);
  const { mutate: approve, isPending, isSuccess, error: approveError } = useApproveOAuth();

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (error || !client) {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error?.message ?? "연결을 요청한 앱을 확인하지 못했어요."}
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">나비스로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const busy = isPending || isSuccess;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5 text-center">
        <h2 className="text-lg font-semibold">
          <span className="text-primary">{client.name}</span>이(가)
          <br />내 나비스에 연결하려고 해요
        </h2>
        <p className="text-xs text-muted-foreground">허용하면 {client.redirectHosts.join(", ")} 로 돌아가요</p>
      </div>

      <ul className="space-y-2.5 rounded-xl bg-muted/50 p-4 text-sm">
        {ABILITIES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
            {text}
          </li>
        ))}
      </ul>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        내 기억에만 닿고 다른 사람의 기억은 보이지 않아요. 설정 → AI 앱 연결에서 언제든 끊을 수 있어요.
      </p>

      {approveError ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {approveError.message}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" disabled={busy}>
          <Link href="/">거절</Link>
        </Button>
        <Button disabled={busy} onClick={() => approve(input)}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {isSuccess ? "연결하는 중…" : "허용"}
        </Button>
      </div>
    </div>
  );
};
