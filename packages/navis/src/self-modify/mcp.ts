import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

// "코드 수정 서브에이전트" 트리거. navis 가 자연어 지시를 받으면
// 이 도구를 호출 → GitHub repository_dispatch 로 self-improve 워크플로 발동.
// 실제 코드 분석/수정/PR 생성은 GitHub Actions 안의 Claude Code 가 수행.
// 호출 측은 fire-and-forget. 결과(PR 검토)는 webhook → 앱 보고(/api/reports)로 기록된다.

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const err = (text: string) => ({
  content: [{ type: "text" as const, text }],
  isError: true,
});

export const SELF_MODIFY_TOOL_NAMES = ["mcp__self_modify__request_self_modification"];

export function buildSelfModifyTools(): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "self_modify",
    version: "0.1.0",
    tools: [
      tool(
        "request_self_modification",
        "이 모노레포의 코드(packages/** — navis, namory, app, desktop 등 모든 패키지)를 수정해 달라는 요청을 GitHub Actions 의 '코드 수정 서브에이전트'에게 위임한다. 즉시 트리거만 던지고 결과(PR 검토)는 별도 보고로 비동기 전달된다. 사용자가 '이거 고쳐줘/앱 버튼 색 바꿔줘/maxTurns 올려줘/X 함수 리팩토링해줘' 같은 코드 변경 요청을 할 때 사용.",
        {
          instruction: z
            .string()
            .min(10)
            .describe(
              "서브에이전트에게 전달할 자연어 지시. 어떤 패키지·어떤 파일·어떤 변경인지 가능한 한 구체적으로(예: 'packages/navis/src/claude/ask.ts 의 maxTurns 16을 20으로', 'packages/app 채팅 입력창 높이 키워줘').",
            ),
        },
        async (args) => {
          if (!config.githubRepo) {
            return err("GITHUB_REPO 환경변수가 설정되지 않음 — 자기 개선 비활성.");
          }
          if (!config.githubToken) {
            return err(
              "GITHUB_TOKEN 이 없거나 권한 부족 — repository_dispatch 호출에 Actions:Write 권한이 필요.",
            );
          }

          const dispatchId = randomUUID();
          const url = `https://api.github.com/repos/${config.githubRepo}/dispatches`;
          const res = await fetch(url, {
            method: "POST",
            headers: {
              accept: "application/vnd.github+json",
              "x-github-api-version": "2022-11-28",
              authorization: `Bearer ${config.githubToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              event_type: "self-improve",
              client_payload: {
                instruction: args.instruction,
                dispatch_id: dispatchId,
              },
            }),
          });

          if (!res.ok) {
            const body = await res.text();
            console.error(
              `[self-modify] dispatch 실패 status=${res.status} body=${body} repo=${config.githubRepo}`,
            );
            return err(
              `GitHub dispatch 실패: ${res.status} ${body}. ` +
                `토큰 권한(Actions:Write) 또는 GITHUB_REPO 값 확인.`,
            );
          }

          console.log(`[self-modify] dispatch 성공 id=${dispatchId}`);
          return ok(
            "코드 수정 서브에이전트에게 작업 의뢰 전송 완료. 작업·검토가 끝나면 보고로 알려주고, PR 은 GitHub 에서도 확인할 수 있어요.",
          );
        },
      ),
    ],
  });
}
