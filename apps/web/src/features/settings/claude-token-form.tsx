"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, KeyRound } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/common/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthField } from "@/features/auth/auth-field";
import { PasswordInput } from "@/features/auth/password-input";
import { useClaudeTokenStatus } from "@/hooks/apis/settings/use-claude-token-status";
import { useDeleteClaudeToken } from "@/hooks/apis/settings/use-delete-claude-token";
import { useUpdateClaudeToken } from "@/hooks/apis/settings/use-update-claude-token";
import { ClaudeTokenGuide } from "./claude-token-guide";

/** setup-token 이 주는 값의 앞부분. 다른 것(API 키 · 명령 자체 · 빈 줄)을 붙여 넣는 실수가 잦다. */
const TOKEN_PREFIX = "sk-ant-oat";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });

/**
 * Claude 구독 토큰 — 등록 · 교체 · 삭제(FR-036).
 *
 * ★ 원문을 화면 상태에 남기지 않는다. 저장이 끝나면 입력 칸을 비운다 — 등록된 뒤에 보이는 건
 *   등록 여부 · 끝 4자리 · 변경 시각뿐이다(FR-037).
 */
export const ClaudeTokenForm = () => {
  const { data: status, isLoading, error } = useClaudeTokenStatus();
  const { mutate: save, isPending: saving } = useUpdateClaudeToken();
  const { mutate: remove, isPending: removing } = useDeleteClaudeToken();
  const [token, setToken] = useState("");
  const trimmed = token.trim();
  // 막지는 않는다 — 형식이 바뀌었을 수도 있다. 대신 붙여 넣는 순간 알린다.
  const looksWrong = trimmed.length > 0 && !trimmed.startsWith(TOKEN_PREFIX);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    save(token, { onSettled: () => setToken("") });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/40 p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">Claude 연결</h2>
        <p className="text-sm text-muted-foreground">
          나비스는 내 Claude 구독으로 답해요. 한 번만 등록하면 돼요 — 아래 순서대로 하면 2–3분이면 끝나요.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : error ? (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error.message}
        </p>
      ) : status?.registered ? (
        <div className="flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2.5 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p>
              등록됨 · 끝자리 <span className="font-mono">····{status.last4}</span>
            </p>
            {status.updatedAt ? (
              <p className="text-xs text-muted-foreground">마지막 변경 {formatTime(status.updatedAt)}</p>
            ) : null}
          </div>
          <ConfirmDeleteButton label="토큰 삭제" disabled={removing} onConfirm={() => remove()} />
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <CircleAlert className="size-4 shrink-0" />
          등록되지 않음 — 토큰을 등록해야 대화할 수 있어요.
        </p>
      )}

      {/* 등록 전이면 펼쳐 두고, 등록돼 있으면 접어 둔다 — 토큰을 바꿀 때만 다시 본다. */}
      {isLoading ? null : status?.registered ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">토큰 새로 만드는 법</summary>
          <div className="pt-3">
            <ClaudeTokenGuide />
          </div>
        </details>
      ) : (
        <ClaudeTokenGuide />
      )}

      <form onSubmit={submit} className="space-y-3">
        <AuthField icon={<KeyRound />} label={status?.registered ? "새 토큰으로 교체" : "토큰 등록"} htmlFor="claude-token">
          <PasswordInput
            id="claude-token"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-oat01-…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="h-10 pl-10 font-mono"
          />
        </AuthField>
        {looksWrong ? (
          <p className="text-xs text-destructive">
            토큰은 보통 <code className="font-mono">sk-ant-oat01-</code> 로 시작해요. 명령어가 아니라 터미널에 나온 값을 붙여 넣었는지 확인해 주세요.
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !token.trim()}>
            {saving ? "저장 중…" : status?.registered ? "교체" : "등록"}
          </Button>
        </div>
      </form>
    </section>
  );
};
