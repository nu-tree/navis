// 피드백 도구 — in-process MCP 서버. **회원의** 대화 턴에만 붙는다(관리자는 자기에게 보낼 일이 없다).
//
// ★ 외부 MCP(/mcp)에 열지 않는다(헌장 보안 절).
// ★ 보내는 회원은 서버를 만들 때 받는다. 도구 입력에는 내용만 있다.
// ★ allowedTools 에 함께 넘겨야 핸들러가 돈다(memory/mcp.ts 주석) — ALLOWED_FEEDBACK_TOOLS 를 쓴다.

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { feedbackToolInputSchema } from "@navis/validation";
import { create } from "./index";

export const FEEDBACK_SERVER_NAME = "feedback";

export const ALLOWED_FEEDBACK_TOOLS: string[] = [`mcp__${FEEDBACK_SERVER_NAME}__send`];

export const createFeedbackMcpServer = ({ senderId }: { senderId: string }) =>
  createSdkMcpServer({
    name: FEEDBACK_SERVER_NAME,
    version: "0.1.0",
    instructions: "사용자가 나비스에 대한 개선점 · 불편 · 바람을 관리자에게 전하는 데 동의했을 때만 쓰는 도구다.",
    tools: [
      tool(
        "send",
        [
          "나비스에 대한 사용자의 피드백을 관리자에게 보낸다. 관리자는 피드백 화면에서 사용자의 이메일과 함께 본다.",
          "사용자에게 보낼 내용을 먼저 보여 주고 사용자가 동의한 뒤에만 부른다.",
          "text: 사용자가 말한 개선점을 관리자가 바로 이해하도록 정리한 글. 무엇이 · 언제 · 어떻게 불편한지, 바라는 것.",
          "사용자의 기억에서 꺼낸 내용을 덧붙이지 않는다. 사용자가 이 대화에서 말한 것만 담는다.",
        ].join("\n"),
        feedbackToolInputSchema.shape,
        async ({ text }) => {
          await create(senderId, text);
          return { content: [{ type: "text" as const, text: "관리자에게 보냈다. 사용자에게 보냈다고 한 줄로 알린다." }] };
        },
      ),
    ],
  });
