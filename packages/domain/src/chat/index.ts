// 대화 턴 실행 — Agent SDK 를 돌려 한 턴을 스트리밍한다.
//
// 두뇌는 Claude Code 구독 OAuth 토큰으로 돈다. SDK 가 process.env 의
// CLAUDE_CODE_OAUTH_TOKEN 을 알아서 집으므로 여기서 토큰을 다루지 않는다
// (`claude setup-token` 으로 발급 → apps/server/.env).
//
// 예전 구현에서 의도적으로 가져오지 않은 것들:
//  - 파일/셸 도구(Read/Write/Edit/Bash). 서버에 소스 트리가 없어 얻는 게 없고,
//    API 토큰이 새면 그대로 임의 명령 실행이 된다. tools: [] 로 전부 끈다.
//  - ChatEnv/prefetch 추상. 주입할 부수 도구가 없다.
//  - 큐레이터(사후 저장 판단). 매 턴 지연에 직접 더해진다.
//
// 기억 MCP 는 in-process 로 붙는다(../memory/mcp.ts). 예전처럼 HTTP MCP 로 자기 자신에게
// 왕복하지 않는다 — 그게 첫 토큰 지연의 가장 큰 원인이었다.

import { query } from "@anthropic-ai/claude-agent-sdk";
import { DEFAULT_MODEL, type Model } from "@navis/validation";
import {
  ALLOWED_MEMORY_TOOLS,
  MEMORY_SERVER_NAME,
  createMemoryMcpServer,
  type MemoryToolTally,
} from "../memory/mcp";

// TODO: settings 모듈이 생기면 DB 의 사용자 시스템 프롬프트로 대체한다(US5).
const SYSTEM_PROMPT = [
  "너는 나비스(navis) — 사용자의 제2의 뇌이자 개인 비서다.",
  "한국어로, 군더더기 없이 답한다. 모르면 모른다고 말한다.",
  "코드·명령은 마크다운 코드블록으로 감싼다.",
  "",
  "## 기억",
  "",
  "사용자에 대해 기억할 가치가 있는 것을 들으면 memory 의 save 를 부른다.",
  "사용자가 '저장해' 라고 지시하기를 기다리지 않는다 — 알아서 남기는 것이 네 일이다.",
  "",
  "남길 것: 결정, 새로 알게 된 것, 아이디어, 감정, 사람에 관한 것, 해야 할 일.",
  "남기지 않을 것: 인사, 감사, 짧은 확인, 질문 자체, 이미 이 대화에서 저장한 사실.",
  "",
  "저장했다고 말하기 전에 도구를 실제로 부른다. 도구가 실패하면 실패했다고 말한다 —",
  "저장되지 않은 것을 저장했다고 말하는 것이 가장 나쁘다.",
].join("\n");

export type TurnInput = {
  prompt: string;
  /** 이어갈 에이전트 세션. 없으면 새 세션으로 시작한다. */
  resumeSessionId?: string | null;
  model?: Model;
  abortController?: AbortController;
};

export type TurnCallbacks = {
  onDelta?: (text: string) => void;
  onThinking?: (text: string) => void;
  /** 도구 호출 시작 — 진행 표시용. */
  onStatus?: (tool: string) => void;
};

export type TurnResult = {
  text: string;
  /** 다음 턴에 넘길 세션 id. result 메시지가 권위다. */
  sessionId: string | null;
  toolsUsed: string[];
  /**
   * 이 턴에 **성공적으로** 저장된 기억 수. `done.saved` 의 근거다(FR-010).
   *
   * 스트림에서 도구 호출을 세지 않는다 — 그러면 실패한 저장도 참으로 잡혀
   * "저장했다고 표시되는데 실제로는 없는" 상태가 된다. 도구 핸들러가 성공한 뒤에만
   * 올린 값을 쓴다.
   */
  savedCount: number;
};

export async function runTurn(
  input: TurnInput,
  cb: TurnCallbacks = {},
): Promise<TurnResult> {
  let text = "";
  let sessionId: string | null = input.resumeSessionId ?? null;
  const toolsUsed: string[] = [];

  // 이 턴 동안의 기억 도구 집계. 도구 핸들러가 클로저로 잡아 직접 올린다.
  const tally: MemoryToolTally = { saved: 0 };

  for await (const message of query({
    prompt: input.prompt,
    options: {
      model: input.model ?? DEFAULT_MODEL,
      systemPrompt: SYSTEM_PROMPT,
      // 내장 도구 전면 차단. 이 배열은 **내장 도구**만 가리키므로 아래 mcpServers 로
      // 들어오는 기억 도구는 영향받지 않는다(실측 확인: tasks.md T007).
      tools: [],
      // 기억 도구. 프로세스 안에 있어 왕복이 없다.
      mcpServers: { [MEMORY_SERVER_NAME]: createMemoryMcpServer(tally) },
      // ★ 없으면 도구가 조용히 실행되지 않는다 — 서버에는 승인할 사람이 없다.
      //   모델은 호출을 시도하고 핸들러는 0회 실행된다(실측: tasks.md T007).
      allowedTools: ALLOWED_MEMORY_TOOLS,
      // 로컬 설정(CLAUDE.md, settings.json) 무시 — 서버는 어느 디렉터리에서
      // 뜨든 같게 동작해야 한다.
      settingSources: [],
      // 부분 메시지(text_delta)를 받아야 스트리밍이 된다.
      includePartialMessages: true,
      // adaptive 라 쉬운 질문엔 생각하지 않는다. effort 기본값(high)은 "안녕"
      // 같은 인사에도 첫 토큰을 ~1.5초 늦춘다(예전 실측: 4.0s → 2.6s).
      // 채팅은 응답성이 우선이라 medium 으로 둔다.
      thinking: { type: "adaptive" },
      effort: "medium",
      maxTurns: 8,
      ...(input.abortController
        ? { abortController: input.abortController }
        : {}),
      ...(input.resumeSessionId ? { resume: input.resumeSessionId } : {}),
    },
  })) {
    if (message.type === "stream_event") {
      const ev = message.event;
      if (ev.type === "content_block_delta") {
        if (ev.delta.type === "text_delta") cb.onDelta?.(ev.delta.text);
        else if (ev.delta.type === "thinking_delta")
          cb.onThinking?.(ev.delta.thinking);
      } else if (
        ev.type === "content_block_start" &&
        ev.content_block.type === "tool_use"
      ) {
        const name = ev.content_block.name;
        cb.onStatus?.(name);
        if (!toolsUsed.includes(name)) toolsUsed.push(name);
      }
      continue;
    }

    if (message.type === "result") {
      // 세션 id 는 result 가 권위다 — 새 세션이면 여기서 처음 알게 된다.
      sessionId = message.session_id;
      if (message.subtype !== "success") {
        throw new Error(`Claude 응답 실패: ${message.subtype}`);
      }
      // result.result 가 최종 전문이다. 델타를 이어 붙인 것보다 이쪽이 정확하다.
      text = message.result;
    }
  }

  return {
    text: text.trim() || "(빈 응답)",
    sessionId,
    toolsUsed,
    savedCount: tally.saved,
  };
}
