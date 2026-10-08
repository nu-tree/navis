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
import {
  recallInputSchema,
  recentInputSchema,
  removeInputSchema,
  renameProjectInputSchema,
  saveInputSchema,
  todosInputSchema,
  updateInputSchema,
  type Memory,
} from "@navis/validation";
import { formatByProject } from "./format";
import { projects, renameProject, similarProjects } from "./projects";
import { kstDate } from "./range";
import { recall } from "./recall";
import { recent } from "./recent";
import { remove } from "./remove";
import { save } from "./save";
import { todos } from "./todos";
import { update } from "./update";

/** 도구 응답의 기억 한 줄. 모델이 이어서 update · remove 를 부를 수 있게 id 를 싣는다. */
const memoryLine = (m: Memory) => {
  const meta = [m.category, m.project, m.done === true ? "완료" : null].filter(Boolean).join("/");
  return `- [${m.createdAt.slice(0, 10)}${meta ? ` ${meta}` : ""}] ${m.content} (id=${m.id})`;
};

/** 기간 조회의 기본 상한. 하루치는 넉넉히 들어가고, 넘으면 응답에 그렇다고 적는다. */
const RECENT_DEFAULT_LIMIT = 200;

/** MCP 서버 이름. 도구는 `mcp__memory__<도구명>` 으로 노출된다. */
export const MEMORY_SERVER_NAME = "memory";

/**
 * 이 서버가 등록하는 도구 이름들. 이야기가 진행되며 채워진다.
 *
 * - US1: save
 * - US2: recall
 * - recent(기간 전건) · projects · rename_project — 2026-10-08
 * - US4: todos, update, remove
 *
 * `graphify` 는 등록하지 않는다 — 기억 그래프는 범위 밖이다.
 */
export const MEMORY_TOOL_NAMES = [
  "save",
  "recall",
  "recent",
  "projects",
  "rename_project",
  "todos",
  "update",
  "remove",
] as const satisfies readonly string[];

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
        // 비슷한 스코프 조회는 저장과 나란히 돌린다 — 저장 지연에 더해지지 않게.
        // 이 조회가 실패해도 저장은 성공한 것이다. 경고만 빠진다.
        const [memory, similar] = await Promise.all([
          save(args),
          args.project ? similarProjects(args.project).catch(() => []) : [],
        ]);
        tally.saved += 1;
        const warning = similar.length
          ? `\n주의: 표기만 다른 프로젝트가 이미 있다 — ${similar.join(", ")}. ` +
            "같은 프로젝트라면 사용자에게 알리고 rename_project 로 합칠지 묻는다."
          : "";
        return {
          content: [
            {
              type: "text" as const,
              text: `저장했다. id=${memory.id} 분류=${memory.category ?? "없음"}${warning}`,
            },
          ],
        };
      },
    ),
    tool(
      "recall",
      [
        "사용자의 과거 기억을 의미로 찾는다. 저장 당시와 같은 단어가 아니어도 찾는다.",
        "",
        "반드시 부를 때:",
        "- 사용자가 과거를 묻는다 ('전에 뭐라고 했지', '왜 그렇게 정했지', '남은 할 일')",
        "- 사용자 본인·과거 결정·진행 중인 일에 대한 답이 필요하다",
        "",
        "부르지 않을 때:",
        "- 인사, 감사, 짧은 확인 — 기억이 필요 없는 말에 검색 비용을 얹지 않는다",
        "- 일반 지식 질문 (기억이 아니라 네가 아는 것으로 답한다)",
        "",
        "query 는 사용자의 말 그대로가 아니라 '무엇을 찾고 싶은가' 로 다듬어 넣는다.",
        "결과가 비면 **기억에 없다고 말한다.** 지어내지 않는다.",
      ].join("\n"),
      recallInputSchema.shape,
      async (args) => {
        const hits = await recall(args);
        if (hits.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "관련된 기억이 없다." },
            ],
          };
        }
        const lines = hits.map((h) => {
          const meta = [h.memory.category, h.memory.project]
            .filter(Boolean)
            .join("/");
          return `- [${h.memory.createdAt.slice(0, 10)}${meta ? ` ${meta}` : ""}] ${h.memory.content}`;
        });
        return {
          content: [
            { type: "text" as const, text: `기억 ${hits.length}건:\n${lines.join("\n")}` },
          ],
        };
      },
    ),
    tool(
      "recent",
      [
        "기간 안의 기억을 **전부** 시간순으로 가져온다. 유사도로 거르지 않는다.",
        "결과는 프로젝트별로 묶여 나온다.",
        "",
        "부를 때:",
        "- '오늘 한 일 정리', '어제 뭐 했지', '이번 주 기록' 처럼 날짜·기간이 기준인 물음",
        "- recall 로는 의미가 가까운 일부만 올라와 그 기간 전체를 놓친다 — 기간이면 이걸 쓴다",
        "",
        "since · until 은 YYYY-MM-DD(한국 시간 하루), ISO 시각, 'today', 'yesterday' 를 받는다.",
        "until 의 날짜는 그날 끝까지 포함한다. 하루만 보려면 since 와 until 에 같은 날을 넣는다.",
        "오늘 날짜를 모르면 'today' 를 쓴다. days 는 지금부터 N일 전까지(달력 날짜가 아니다).",
        "project 를 주면 그 프로젝트 + 개인 기억으로 좁힌다.",
      ].join("\n"),
      recentInputSchema.shape,
      async (args) => {
        const limit = args.limit ?? RECENT_DEFAULT_LIMIT;
        const items = await recent({ ...args, limit });
        const range = [
          args.since ? `${args.since}부터` : null,
          args.until ? `${args.until}까지` : null,
          args.days ? `최근 ${args.days}일` : null,
        ]
          .filter(Boolean)
          .join(" ");
        const head = `${range ? `${range} ` : ""}기억 ${items.length}건 (오늘 KST ${kstDate()})`;
        if (items.length === 0) {
          return { content: [{ type: "text" as const, text: `${head}\n그 기간에 기억이 없다.` }] };
        }
        // 상한에 닿았으면 잘렸을 수 있다. 전건이라고 믿고 정리하면 빠진 것을 모른다.
        const cut =
          items.length >= limit
            ? `\n\n상한 ${limit}건에 닿았다 — 더 있을 수 있다. 기간을 나눠 다시 부른다.`
            : "";
        return {
          content: [
            { type: "text" as const, text: `${head}\n\n${formatByProject(items)}${cut}` },
          ],
        };
      },
    ),
    tool(
      "projects",
      [
        "저장된 기억의 프로젝트 스코프 목록과 각각의 기억 수를 본다.",
        "프로젝트 이름을 정할 때 기존 표기를 확인하거나, 표기만 다른 스코프를 찾을 때 쓴다.",
      ].join("\n"),
      {},
      async () => {
        const list = await projects();
        if (list.length === 0) {
          return { content: [{ type: "text" as const, text: "프로젝트 스코프가 없다." }] };
        }
        const lines = list.map(
          (p) => `- ${p.project}: ${p.count}건 (최근 ${p.lastAt.slice(0, 10)})`,
        );
        return {
          content: [
            { type: "text" as const, text: `프로젝트 ${list.length}개:\n${lines.join("\n")}` },
          ],
        };
      },
    ),
    tool(
      "rename_project",
      [
        "프로젝트 스코프 from 의 기억을 전부 to 로 옮긴다.",
        "to 가 이미 있으면 두 스코프가 합쳐진다(merge). 이름 바꾸기와 합치기는 같은 도구다.",
        "",
        "사용자가 이름 변경·합치기를 요청했거나, 표기만 다른 스코프를 합치자는 제안에 동의했을 때만 부른다.",
        "합친 뒤에는 되돌릴 수 없다 — 어느 기억이 원래 어느 쪽이었는지 남지 않는다.",
        "from 이 없는 스코프면 오류다. projects 로 정확한 표기를 먼저 확인한다.",
      ].join("\n"),
      renameProjectInputSchema.shape,
      async (args) => {
        const r = await renameProject(args);
        return {
          content: [
            {
              type: "text" as const,
              text: r.merged
                ? `합쳤다. ${r.from} → ${r.to} (기억 ${r.moved}건 이동)`
                : `이름을 바꿨다. ${r.from} → ${r.to} (기억 ${r.moved}건)`,
            },
          ],
        };
      },
    ),
    tool(
      "todos",
      [
        "할 일로 저장된 기억을 본다. 기본은 미완료만, includeDone 이면 완료된 것도 함께.",
        "'남은 할 일', '할 일 뭐 있지' 같은 물음에 쓴다. 의미 검색(recall)보다 빠짐이 없다.",
        "결과의 id 로 update(done) 를 불러 완료 처리할 수 있다.",
      ].join("\n"),
      todosInputSchema.shape,
      async (args) => {
        const list = await todos(args);
        if (list.length === 0) {
          return { content: [{ type: "text" as const, text: "남은 할 일이 없다." }] };
        }
        return {
          content: [
            { type: "text" as const, text: `할 일 ${list.length}건:\n${list.map(memoryLine).join("\n")}` },
          ],
        };
      },
    ),
    tool(
      "update",
      [
        "저장된 기억 하나를 고친다. 준 필드만 바뀐다.",
        "",
        "부를 때:",
        "- 사용자가 기억이 틀렸다고 고쳐줄 때, 할 일을 끝냈다고 할 때(done: true)",
        "- 새로 들은 사실이 이전 기억을 대체할 때 — 새로 save 하지 말고 고친다",
        "",
        "id 는 recall · recent · todos 결과에 있다. 모르면 먼저 찾는다 — 지어내지 않는다.",
        "project 에 빈 문자열을 주면 개인 기억으로 되돌린다.",
      ].join("\n"),
      updateInputSchema.shape,
      async (args) => {
        const m = await update(args);
        return { content: [{ type: "text" as const, text: `고쳤다.\n${memoryLine(m)}` }] };
      },
    ),
    tool(
      "remove",
      [
        "기억 하나를 지운다. 되돌릴 수 없다.",
        "사용자가 지우라고 했을 때만 부른다. 틀린 기억은 지우지 말고 update 로 고친다.",
      ].join("\n"),
      removeInputSchema.shape,
      async ({ id }) => {
        await remove(id);
        return { content: [{ type: "text" as const, text: `지웠다. id=${id}` }] };
      },
    ),
  ],
  });
