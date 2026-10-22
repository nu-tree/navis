"use client";

import { useState } from "react";
import { KeyRound, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIssueConnectionToken } from "@/hooks/apis/connection/use-issue-connection-token";
import { CommandLine } from "./command-line";

/**
 * 로그인(OAuth)을 못 하는 앱용 — 토큰을 만들어 헤더로 넣는다.
 *
 * ★ 원문은 이 컴포넌트 상태에만 잠깐 있다. 화면을 떠나면 다시 볼 수 없다 — 잃어버리면 끊고 새로 만든다.
 */
export const DirectTokenPanel = ({ url }: Readonly<{ url: string }>) => {
  const { mutate: issue, isPending } = useIssueConnectionToken();
  const [label, setLabel] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    issue(label.trim() || undefined, {
      onSuccess: (issued) => {
        setToken(issued.token);
        setLabel("");
      },
    });
  };

  if (token) {
    const config = JSON.stringify(
      { mcpServers: { navis: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } },
      null,
      2,
    );
    return (
      <div className="space-y-3 text-sm">
        <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          이 토큰은 <b>지금 한 번만</b> 보여요. 비밀번호처럼 다른 사람에게 주지 마세요.
        </p>
        <div>
          <p className="font-medium">토큰</p>
          <CommandLine text={token} />
        </div>
        <div>
          <p className="font-medium">MCP 설정 파일에 넣을 때 (Cursor 등)</p>
          <CommandLine text={config} multiline />
        </div>
        <div>
          <p className="font-medium">Claude Code 에 토큰으로 넣을 때</p>
          <CommandLine
            text={`claude mcp add --scope user --transport http navis ${url} --header "Authorization: Bearer ${token}"`}
          />
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setToken(null)}>
            다 옮겼어요
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Claude 가 아닌 앱(Cursor 등)이나 로그인 창을 띄울 수 없는 곳에서 써요. 토큰을 만들어 앱의 MCP 설정에 붙여 넣어요.
        <span className="block pt-1 text-xs">Claude 앱 · Claude Code 는 앞 탭의 로그인 방식이 더 쉬워요.</span>
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            placeholder="어디에 쓸지 (예: 회사 노트북 Cursor)"
            className="h-9 pl-9"
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "만드는 중…" : "토큰 만들기"}
        </Button>
      </div>
    </form>
  );
};
