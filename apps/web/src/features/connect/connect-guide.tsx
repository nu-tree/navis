"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommandLine } from "./command-line";
import { DirectTokenPanel } from "./direct-token-panel";

type Tab = "claude-app" | "claude-code" | "other";

/** Claude Code 가 작업 끝에 알아서 남기게 하는 한 단락 — CLAUDE.md 에 붙여 넣는다. */
const CLAUDE_MD_SNIPPET = `# 나비스
- 의미 있는 작업(결정 · 버그 원인 · 새로 알게 된 것)을 끝내면 navis 의 save 로 한두 문장 요약을 남긴다.
- 과거 결정이나 맥락이 필요하면 작업 전에 navis 의 recall 로 먼저 찾아본다.`;

const Step = ({ n, children }: Readonly<{ n: number; children: React.ReactNode }>) => (
  <li className="flex gap-2.5">
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
      {n}
    </span>
    <div className="min-w-0 flex-1">{children}</div>
  </li>
);

const Try = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <p className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" />
    <span>{children}</span>
  </p>
);

/** claude.ai 웹 · 데스크톱 · 모바일 앱 — 주소 하나 붙여 넣고 "허용"만 누르면 된다. 터미널이 필요 없다. */
const ClaudeAppSteps = ({ url }: Readonly<{ url: string }>) => (
  <div className="space-y-3">
    <ol className="space-y-3 text-sm">
      <Step n={1}>
        컴퓨터 브라우저로 <b>claude.ai</b> 에 들어가 왼쪽 아래 <b>내 이름 → 설정 → 커넥터</b>를 열어요.
      </Step>
      <Step n={2}>
        <b>커스텀 커넥터 추가</b>를 눌러요.
      </Step>
      <Step n={3}>
        이름에는 <b>나비스</b>, 주소(URL)에는 아래 값을 붙여 넣고 <b>추가</b>를 눌러요.
        <CommandLine text={url} />
      </Step>
      <Step n={4}>
        <b>연결</b>을 누르면 나비스 화면이 열려요. <b>허용</b>을 누르면 끝이에요.
        <span className="block text-xs text-muted-foreground">로그인이 안 돼 있으면 나비스 로그인부터 나와요.</span>
      </Step>
    </ol>
    <Try>
      Claude 대화창에서 <b>“나비스에서 지난주에 정한 거 찾아줘”</b> 처럼 말해 보세요. 한 번 연결하면 같은 계정의
      Claude 데스크톱 · 휴대폰 앱에서도 바로 써요. 메뉴 이름은 Claude 업데이트에 따라 조금 다를 수 있어요.
    </Try>
  </div>
);

/** Claude Code — 명령 한 줄 + /mcp 에서 로그인. 토큰을 복사할 일이 없다. */
const ClaudeCodeSteps = ({ url }: Readonly<{ url: string }>) => (
  <div className="space-y-3">
    <ol className="space-y-3 text-sm">
      <Step n={1}>
        터미널에서 아래 명령을 실행해요. 어느 폴더에서든 나비스를 쓰게 돼요.
        <CommandLine text={`claude mcp add --scope user --transport http navis ${url}`} />
      </Step>
      <Step n={2}>
        Claude Code 를 켜고 <code className="rounded bg-muted px-1 font-mono text-xs">/mcp</code> 를 입력 → <b>navis</b> 선택 →{" "}
        <b>Authenticate</b> 를 눌러요.
      </Step>
      <Step n={3}>
        브라우저에 나비스 화면이 열리면 <b>허용</b>을 눌러요. 터미널로 돌아오면 연결돼 있어요.
      </Step>
    </ol>
    <Try>
      <b>“navis 에 최근 기억 보여줘”</b> 라고 해 보세요. 이미 예전 방식(토큰 헤더)으로 연결해 뒀다면{" "}
      <code className="font-mono">claude mcp remove navis</code> 후 다시 추가하면 돼요.
    </Try>
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">알아서 기억하게 하기 (선택)</summary>
      <p className="pt-2 text-xs text-muted-foreground">
        <code className="font-mono">~/.claude/CLAUDE.md</code> 에 붙여 넣으면 작업이 끝날 때마다 나비스에 남기고, 필요할 때 먼저 찾아봐요.
      </p>
      <CommandLine text={CLAUDE_MD_SNIPPET} multiline />
    </details>
  </div>
);

/**
 * 내 나비스를 다른 AI 앱에 붙이는 안내. 터미널을 모르는 사람이 가장 많이 쓸 claude.ai 를 먼저 연다.
 * 주소(url)는 이 화면이 열린 도메인에서 만든다 — 회원마다 같고, 누구 것인지는 로그인(허용)이 정한다.
 */
export const ConnectGuide = ({ url }: Readonly<{ url: string }>) => {
  const [tab, setTab] = useState<Tab>("claude-app");

  return (
    <div className="rounded-xl border border-border p-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="w-full">
          <TabsTrigger value="claude-app">Claude 앱 · 웹</TabsTrigger>
          <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
          <TabsTrigger value="other">다른 앱</TabsTrigger>
        </TabsList>
        <TabsContent value="claude-app" className="pt-4">
          <ClaudeAppSteps url={url} />
        </TabsContent>
        <TabsContent value="claude-code" className="pt-4">
          <ClaudeCodeSteps url={url} />
        </TabsContent>
        <TabsContent value="other" className="pt-4">
          <DirectTokenPanel url={url} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
