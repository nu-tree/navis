"use client";

import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClaudeTokenStatus } from "@/hooks/apis/settings/use-claude-token-status";

type Props = {
  /** 방금 턴이 토큰 문제로 실패했는지. 거절(만료)은 등록돼 있어도 카드를 띄운다. */
  errorCode: string | null;
};

/**
 * Claude 가 연결되지 않았을 때 입력창 위에 뜨는 안내. 예전엔 말을 보내 봐야 오류 한 줄로 알았다 —
 * 처음 온 사람이 무엇을 해야 하는지 바로 알게 한다. 상태를 모르는 동안(로딩 · 실패)은 띄우지 않는다.
 */
export const ClaudeConnectCard = ({ errorCode }: Readonly<Props>) => {
  const { data: status } = useClaudeTokenStatus();
  const rejected = errorCode === "claude_token_rejected";
  const missing = errorCode === "claude_token_missing" || status?.registered === false;
  if (!rejected && !missing) return null;

  return (
    <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
      <KeyRound className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{rejected ? "Claude 연결을 다시 해 주세요" : "먼저 Claude 와 연결해 주세요"}</p>
        <p className="text-xs text-muted-foreground">
          {rejected
            ? "등록한 토큰이 만료됐거나 Claude 가 받지 않아요. 새로 만들어 붙여 넣으면 바로 이어져요."
            : "나비스는 내 Claude 구독으로 답해요. 한 번만 하면 되고, 2–3분이면 끝나요."}
        </p>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link href="/settings">연결하기</Link>
      </Button>
    </div>
  );
};
