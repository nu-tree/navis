// 기억 MCP — 프로세스 안에 붙인다.
//
// ★ HTTP MCP 로 자기 자신에게 왕복하지 않는다. 예전 구현이 그랬고, 코드 주석이 그것을
//   "첫 토큰 ~1.6초 바닥(모델 무관)"의 원인으로 지목했다(STRUCTURE.md 1항, 헌장 성능 절).
//
// ★ 실측으로 확인한 것 두 가지 (2026-09-10, tasks.md T007):
//   1) `Options.tools: []` 는 **내장 도구**만 막는다. 여기서 등록하는 MCP 도구는
//      `mcpServers` 로 따로 들어오므로 영향을 받지 않는다. Read/Write/Edit/Bash 는
//      계속 존재하지 않고 기억 도구만 열린다.
//   2) `allowedTools` 가 **없으면 도구가 실행되지 않는다.** 모델은 호출을 시도하지만
//      핸들러가 한 번도 돌지 않았다(0회). 서버에는 승인할 사람이 없기 때문이다.
//      그 상태로 두면 모델이 "저장했다"고 답하는데 실제로는 저장되지 않는다 —
//      가장 나쁜 실패다. 그래서 ALLOWED_MEMORY_TOOLS 를 반드시 함께 넘긴다.

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { saveInputSchema } from "@navis/validation";
import { save } from "./save";

/** MCP 서버 이름. 도구는 `mcp__memory__<도구명>` 으로 노출된다. */
export const MEMORY_SERVER_NAME = "memory";

/**
 * 이 서버가 등록하는 도구 이름들. 이야기가 진행되며 채워진다.
 *
 * - US1: save
 * - US2: recall
 * - US4: recent, todos, update, remove
 *
 * `graphify` 는 등록하지 않는다 — 기억 그래프는 범위 밖이다.
 */
export const MEMORY_TOOL_NAMES = ["save"] as const satisfies readonly string[];

/**
 * `Options.allowedTools` 에 넘길 값.
 *
 * 도구를 추가할 때 MEMORY_TOOL_NAMES 에만 넣으면 여기까지 자동으로 따라온다 —
 * 한쪽만 고쳐서 조용히 막히는 일을 막는다.
 */
export const ALLOWED_MEMORY_TOOLS: string[] = MEMORY_TOOL_NAMES.map(
  (name) => `mcp__${MEMORY_SERVER_NAME}__${name}`,
);

/** 한 턴 동안 기억 도구가 무엇을 했는지. done.saved 의 근거다(FR-010). */
export type MemoryToolTally = {
  /** **성공한** 저장 횟수. 실패한 저장은 세지 않는다. */
  saved: number;
};

/**
 * 프로세스 내 기억 MCP 서버를 턴마다 만든다.
 *
 * 모듈 수준에서 하나를 재사용하지 않는 이유: 핸들러가 이 턴의 집계(tally)를 클로저로
 * 잡아야 한다. 모듈 수준 카운터를 쓰면 동시에 도는 두 턴이 서로의 저장을 센다.
 *
 * 비용은 객체 생성뿐이다 — 서버 등록 핸드셰이크는 query() 를 부를 때 어차피 턴마다
 * 일어나므로, 인스턴스를 재사용해도 줄어들지 않는다.
 */
export const createMemoryMcpServer = (tally: MemoryToolTally) =>
  createSdkMcpServer({
  name: MEMORY_SERVER_NAME,
  version: "0.1.0",
  instructions: [
    "사용자의 기억을 다루는 도구다.",
    "기억할 가치가 있는 사실을 들으면 저장하고, 과거를 물으면 찾아본다.",
    "인사나 잡담에는 쓰지 않는다.",
  ].join(" "),
  tools: [
    tool(
      "save",
      [
        "사용자에 대해 기억할 가치가 있는 사실을 저장한다.",
        "",
        "부를 때:",
        "- 결정한 것, 새로 알게 된 것, 떠오른 아이디어, 감정, 사람에 관한 것, 해야 할 일",
        "- 사용자가 명시적으로 기억해달라고 할 때",
        "",
        "부르지 않을 때:",
        "- 인사, 감사, 짧은 확인 같은 잡담",
        "- 이미 이 대화에서 저장한 것과 같은 사실",
        "- 사용자가 물어보기만 한 것 (질문은 사실이 아니다)",
        "",
        "content 는 나중에 읽어도 맥락이 통하는 완결된 문장으로 쓴다.",
        "'그거 하기로 했다' 처럼 지시어에 의존하면 나중에 무슨 말인지 알 수 없다.",
        "분류(category)는 가능하면 채운다. 대화에 프로젝트 맥락이 있으면 project 도 채운다.",
      ].join("\n"),
      saveInputSchema.shape,
      async (args) => {
        // 실패하면 여기서 던진다 — SDK 가 오류를 모델에게 전달해 답에 반영되게 한다.
        // 삼키면 모델이 "저장했다"고 답하는데 실제로는 저장되지 않는다(최악의 실패).
        const memory = await save(args);
        tally.saved += 1;
        return {
          content: [
            {
              type: "text" as const,
              text: `저장했다. id=${memory.id} 분류=${memory.category ?? "없음"}`,
            },
          ],
        };
      },
    ),
  ],
  });
