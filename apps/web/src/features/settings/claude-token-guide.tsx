"use client";

import { useState } from "react";
import { Smartphone } from "lucide-react";
import { CopyButton } from "@/components/common/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDeviceOs, type DeviceOs } from "@/hooks/common/use-device-os";

type DesktopOs = Exclude<DeviceOs, "mobile">;

// 토큰 발급 안내 — 터미널을 처음 여는 사람도 따라오게 단계마다 복사 버튼을 단다.
// 설치 명령은 Claude Code 공식 설치 스크립트다(code.claude.com/docs/en/setup, 2026-10-15 확인). 바뀌면 여기만 고친다.
const STEPS: Record<DesktopOs, { open: string; install: string }> = {
  mac: {
    open: "⌘ + Space 로 Spotlight 를 열고 '터미널'을 찾아 열어요.",
    install: "curl -fsSL https://claude.ai/install.sh | bash",
  },
  windows: {
    open: "시작 메뉴에서 'PowerShell'을 찾아 열어요. 줄 앞이 PS C:\\ 로 시작하면 맞아요.",
    install: "irm https://claude.ai/install.ps1 | iex",
  },
  linux: {
    open: "터미널을 열어요.",
    install: "curl -fsSL https://claude.ai/install.sh | bash",
  },
};

const TOKEN_COMMAND = "claude setup-token";

const Command = ({ text }: Readonly<{ text: string }>) => (
  <div className="mt-1.5 flex items-center gap-1 rounded-lg bg-muted py-1 pr-1 pl-3">
    <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap">{text}</code>
    <CopyButton text={text} className="size-7 shrink-0" />
  </div>
);

const Steps = ({ os }: Readonly<{ os: DesktopOs }>) => (
  <ol className="space-y-3 text-sm">
    <li>
      <b>1.</b> {STEPS[os].open}
    </li>
    <li>
      <b>2.</b> Claude Code 를 설치해요. <span className="text-muted-foreground">(이미 있으면 건너뛰어요)</span>
      <Command text={STEPS[os].install} />
    </li>
    <li>
      <b>3.</b> <b>터미널 창을 닫고 새로 연 뒤</b> 토큰을 만들어요. 브라우저가 열리면 내 Claude 계정으로 로그인해요.
      <span className="block text-xs text-muted-foreground">Claude Pro · Max 구독이 있어야 해요. 무료 계정은 안 돼요.</span>
      <Command text={TOKEN_COMMAND} />
    </li>
    <li>
      <b>4.</b> 터미널에 나온 <code className="rounded bg-muted px-1 font-mono text-xs">sk-ant-oat01-…</code> 을 복사해 아래 칸에 붙여 넣어요.
    </li>
  </ol>
);

/**
 * Claude 토큰 발급 안내 — 접속한 기기의 운영체제 탭을 먼저 연다. 휴대폰이면 컴퓨터에서 하라고 알린다
 * (터미널이 필요하다). 판단은 useDeviceOs 가 하고 여기는 그리기만 한다.
 */
export const ClaudeTokenGuide = () => {
  const os = useDeviceOs();
  const [tab, setTab] = useState<DesktopOs | null>(null);
  const current: DesktopOs = tab ?? (os === "mobile" ? "mac" : os);

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      {os === "mobile" ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Smartphone className="mt-0.5 size-3.5 shrink-0" />
          토큰은 컴퓨터의 터미널에서 만들어요. 컴퓨터로 나비스에 들어와 등록하면 휴대폰에서도 바로 써요.
        </p>
      ) : null}
      <Tabs value={current} onValueChange={(v) => setTab(v as DesktopOs)}>
        <TabsList>
          <TabsTrigger value="mac">Mac</TabsTrigger>
          <TabsTrigger value="windows">Windows</TabsTrigger>
          <TabsTrigger value="linux">Linux</TabsTrigger>
        </TabsList>
        <TabsContent value="mac" className="pt-3">
          <Steps os="mac" />
        </TabsContent>
        <TabsContent value="windows" className="pt-3">
          <Steps os="windows" />
        </TabsContent>
        <TabsContent value="linux" className="pt-3">
          <Steps os="linux" />
        </TabsContent>
      </Tabs>
    </div>
  );
};
