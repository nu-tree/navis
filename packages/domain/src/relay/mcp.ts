// 전하기 도구 — in-process MCP 서버(specs/004 contracts/relay-tools.md).
//
//   relay_run — 전하기 턴에만 붙는다. 맡겨진 말을 받는 회원에게 전하기(deliver) 하나.
//
// ★ 외부 MCP(/mcp)에 열지 않는다(헌장 보안 절).
// ★ 받는 회원 id 는 서버를 만들 때 받는다. 도구 입력에는 없다.
// ★ allowedTools 에 함께 넘겨야 핸들러가 돈다(memory/mcp.ts 주석) — ALLOWED_* 를 쓴다.
// ★ promise_run.notify 를 재사용하지 않는다 — 약속의 origin · "조용함이 정상" · memo/finish 가 따라온다(research R7).

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { relayDeliverInputSchema } from "@navis/validation";
import { deliver } from "../promise/deliver";

export const RELAY_RUN_SERVER_NAME = "relay_run";

export const ALLOWED_RELAY_RUN_TOOLS: string[] = [`mcp__${RELAY_RUN_SERVER_NAME}__deliver`];

const reply = (text: string) => ({ content: [{ type: "text" as const, text }] });
const refuse = (text: string) => ({ ...reply(text), isError: true });

/** 전하기 턴 한 번 동안 도구가 남긴 것. run.ts 가 결과로 옮긴다. 턴마다 새로 만든다. */
export type RelayRunState = {
  /** deliver 로 남긴 메시지. 없으면 이번 전하기는 실패다 — 전하기에는 "조용함"이 없다(FR-013). */
  messageId?: string;
};

export type RelayRunMcpContext = {
  recipientId: string;
  relayId: string;
  state: RelayRunState;
};

export const createRelayRunMcpServer = ({ recipientId, relayId, state }: RelayRunMcpContext) =>
  createSdkMcpServer({
    name: RELAY_RUN_SERVER_NAME,
    version: "0.1.0",
    instructions: "맡겨진 말을 전하는 동안만 쓰는 도구다. 사용자에게 말을 거는 길은 deliver 하나뿐이다.",
    tools: [
      tool(
        "deliver",
        [
          "맡겨진 말을 이 사용자에게 전한다 — '나비스' 방에 네 메시지가 올라가고 알림이 간다.",
          "반드시 한 번 부른다. 부르지 않으면 전하기는 실패다.",
          "한 번만 부를 수 있다. 할 말을 한 메시지에 담는다.",
        ].join("\n"),
        relayDeliverInputSchema.shape,
        async ({ text }) => {
          if (state.messageId) return refuse("이번 전하기에서는 이미 전했어요.");
          const message = await deliver(recipientId, { relayId }, text);
          state.messageId = message.id;
          return reply("전했다.");
        },
      ),
    ],
  });
