"use client";

import { useSyncExternalStore } from "react";
import { CircleAlert, KeyRound, Plug } from "lucide-react";
import type { McpConnection } from "@navis/validation";
import { ConfirmDeleteButton } from "@/components/common/confirm-delete-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnectionList } from "@/hooks/apis/connection/use-connection-list";
import { useRevokeConnection } from "@/hooks/apis/connection/use-revoke-connection";
import { ConnectGuide } from "./connect-guide";

const noop = () => () => {};
/** 이 화면이 열린 도메인의 MCP 주소. 서버 렌더에서는 빈 값이다(주소가 보이기 전 한 번). */
const useMcpUrl = () => useSyncExternalStore(noop, () => `${window.location.origin}/api/mcp`, () => "");

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { dateStyle: "medium" });

const ConnectionRow = ({ connection }: Readonly<{ connection: McpConnection }>) => {
  const { mutate: revoke, isPending } = useRevokeConnection();
  const Icon = connection.kind === "oauth" ? Plug : KeyRound;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
      <Icon className="size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate">
          {connection.label}
          <Badge variant="secondary" className="text-[10px]">
            {connection.kind === "oauth" ? "로그인" : "토큰"}
          </Badge>
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(connection.createdAt)} 연결 ·{" "}
          {connection.lastUsedAt ? `${formatDate(connection.lastUsedAt)} 마지막 사용` : "아직 쓰지 않음"}
        </p>
      </div>
      <ConfirmDeleteButton label="연결 끊기" disabled={isPending} onConfirm={() => revoke(connection.id)} />
    </li>
  );
};

/**
 * AI 앱 연결 — 내 나비스를 Claude(웹 · 데스크톱 · 휴대폰) · Claude Code · 다른 MCP 앱에 붙인다.
 * 연결한 앱은 내 기억만 읽고 쓴다(specs/002 FR-113 개정). 연결이 없으면 안내를 펼쳐 두고, 있으면 접는다.
 */
export const AiConnectSection = () => {
  const url = useMcpUrl();
  const { data: connections, isLoading, error } = useConnectionList();
  const empty = !isLoading && !error && (connections?.length ?? 0) === 0;

  return (
    <section id="connect" className="scroll-mt-4 space-y-4 rounded-2xl border border-border bg-card/40 p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">AI 앱 연결</h2>
        <p className="text-sm text-muted-foreground">
          Claude 에서 일하다가도 <b>내 나비스의 기억</b>을 꺼내 쓰고, 정한 것을 바로 남길 수 있어요. 주소 하나만
          붙여 넣고 허용을 누르면 돼요 — 1분이면 끝나요.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : error ? (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error.message}
        </p>
      ) : connections && connections.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {connections.map((c) => (
            <ConnectionRow key={c.id} connection={c} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">아직 연결된 앱이 없어요.</p>
      )}

      {url ? (
        empty ? (
          <ConnectGuide url={url} />
        ) : (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">다른 앱 연결하기</summary>
            <div className="pt-3">
              <ConnectGuide url={url} />
            </div>
          </details>
        )
      ) : null}
    </section>
  );
};
