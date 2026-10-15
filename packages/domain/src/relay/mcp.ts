// 전하기 도구 — in-process MCP 서버(specs/004 contracts/relay-tools.md).
//
//   relay     — **관리자의** 대화 턴에만 붙는다. "OO한테 ~ 전해줘"를 맡기기(relay) 하나.
//   relay_run — 전하기 턴에만 붙는다. 맡겨진 말을 받는 회원에게 전하기(deliver) 하나.
//
// ★ 외부 MCP(/mcp)에 열지 않는다(헌장 보안 절).
// ★ 회원 id 는 서버를 만들 때 받는다. 도구 입력에는 없다 — relay 의 받는 사람은 이름 · 이메일 문자열이고
//   회원 목록 안에서만 맞춘다(헌장 원칙 II, research R5). 모델이 회원 id 를 지어낼 자리가 없다.
// ★ allowedTools 에 함께 넘겨야 핸들러가 돈다(memory/mcp.ts 주석) — ALLOWED_* 를 쓴다.
// ★ promise_run.notify 를 재사용하지 않는다 — 약속의 origin · "조용함이 정상" · memo/finish 가 따라온다(research R7).

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { relayDeliverInputSchema, relayToolInputSchema } from "@navis/validation";
import { isClaudeTokenError } from "../errors";
import { list as listMembers, matchMember } from "../member/index";
import { deliver } from "../promise/deliver";
import { create } from "./index";

export const RELAY_SERVER_NAME = "relay";
export const RELAY_RUN_SERVER_NAME = "relay_run";

export const ALLOWED_RELAY_TOOLS: string[] = [`mcp__${RELAY_SERVER_NAME}__relay`];
export const ALLOWED_RELAY_RUN_TOOLS: string[] = [`mcp__${RELAY_RUN_SERVER_NAME}__deliver`];

type ToolReply = { content: { type: "text"; text: string }[]; isError?: boolean };

const reply = (text: string): ToolReply => ({ content: [{ type: "text", text }] });
const refuse = (text: string): ToolReply => ({ ...reply(text), isError: true });

/**
 * relay 도구 한 번. 받는 사람을 회원 목록 안에서만 정하고, 하나로 정해질 때만 맡긴다(US2-2).
 * 못 정하면 후보를 isError 로 돌려준다 — 모델이 관리자에게 되묻게.
 */
export async function handleRelayTool(senderId: string, to: string, instruction: string): Promise<ToolReply> {
  const members = await listMembers();
  const match = matchMember(members, to);
  if (match.kind === "none") {
    return refuse(`'${to}' 에 맞는 회원이 없어요. 회원: ${members.map((m) => m.label).join(", ") || "(없음)"}`);
  }
  if (match.kind === "ambiguous") {
    return refuse(`누구인지 정할 수 없어요. 후보: ${match.candidates.map((m) => m.label).join(", ")}`);
  }
  try {
    const item = await create(senderId, match.member, instruction);
    return reply(`${item.to} 님께 전하기를 맡겼어요. 1–2분 안에 도착해요. 사용자에게 누구에게 무엇을 맡겼는지 한 줄로 확인한다.`);
  } catch (err) {
    if (isClaudeTokenError(err)) return refuse(err.message);
    throw err;
  }
}

export type RelayMcpContext = {
  /** 보낸 관리자. 이 서버는 server 가 관리자라고 판정한 턴에만 만들어진다(research R6). */
  senderId: string;
};

export const createRelayMcpServer = ({ senderId }: RelayMcpContext) =>
  createSdkMcpServer({
    name: RELAY_SERVER_NAME,
    version: "0.1.0",
    instructions: "관리자가 다른 회원에게 무언가를 전해 달라고 할 때만 쓰는 도구다.",
    tools: [
      tool(
        "relay",
        [
          "다른 회원의 나비스에게 전할 말을 맡긴다. 그 회원의 나비스가 그 회원에게 맞게 다듬어 1–2분 안에 먼저 말을 건다.",
          "사용자가 'OO한테 ~ 전해줘 · 알려줘 · 물어봐줘'처럼 다른 사람에게 전해 달라고 할 때만 부른다.",
          "to: 받는 사람의 이메일이나 이름(사용자가 부른 그대로).",
          "instruction: 사용자가 전해 달라고 한 말을 그대로 담는다 — '내가 전했다고 해줘'처럼 출처를 밝히라는 말이 있으면 그것도.",
          "네 기억에서 꺼낸 내용을 덧붙이지 않는다. 사용자가 말한 것만 넘어간다.",
          "받는 사람을 하나로 정할 수 없으면 후보가 돌아온다 — 사용자에게 누구인지 되묻는다.",
        ].join("\n"),
        relayToolInputSchema.shape,
        async ({ to, instruction }) => handleRelayTool(senderId, to, instruction),
      ),
    ],
  });

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
