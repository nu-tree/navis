import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { setSystemPrompt } from "../system-prompt.js";

// navis 가 대화 중 자기 시스템 프롬프트(성격·행동 지침)를 직접 바꾸는 도구.
// 사용자가 "시스템 프롬프트 ~로 바꿔/업데이트해줘" 라고 명시적으로 요청할 때만 호출.
export const SETTINGS_TOOL_NAMES = ["mcp__settings__update_system_prompt"];

export function buildSettingsTools(): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: "settings",
    version: "0.1.0",
    tools: [
      tool(
        "update_system_prompt",
        "navis 자신의 시스템 프롬프트(성격·행동 지침) 전문을 교체한다. 사용자가 명시적으로 '시스템 프롬프트/성격을 ~로 바꿔·업데이트해줘' 라고 요청할 때만 사용. 다음 턴부터 적용된다. 기존 내용을 통째로 덮으므로, 일부만 바꾸는 거면 현재 내용을 바탕으로 합의된 새 전문을 통째로 넣어라.",
        {
          prompt: z
            .string()
            .min(10)
            .describe("새 시스템 프롬프트 전문(전체 교체 — 기존을 덮어씀)"),
        },
        async (args) => {
          try {
            await setSystemPrompt(args.prompt);
            return {
              content: [
                {
                  type: "text" as const,
                  text: "시스템 프롬프트를 업데이트했어요. 다음 턴부터 적용됩니다.",
                },
              ],
            };
          } catch (err) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `업데이트 실패: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              isError: true,
            };
          }
        },
      ),
    ],
  });
}
