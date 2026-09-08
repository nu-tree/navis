// ── 기억 도구 단일 레지스트리 ────────────────────────────────────────────────
// 도구의 이름·설명·입력 스키마·핸들러를 "데이터"로 한 번만 정의한다. 이 정의를
// 두 소비자가 각자 어댑터로 감싼다:
//   1) mcp.ts        → MCP SDK 의 McpServer (공개 /mcp 라우트 — Claude 커스텀 커넥터)
//   2) navis 에이전트 → Agent SDK 의 in-process MCP 서버 (HTTP 홉 없이 직접 호출)
// 예전에는 1) 만 있었고 navis 가 HTTP 로 그걸 다시 호출했다. 통합 후에는 2) 가
// 기본 경로가 되는데, 도구 정의를 양쪽에 각각 적으면 설명·스키마가 조용히 어긋나
// "커넥터에서는 되는데 앱 채팅에서는 안 되는" 종류의 버그가 생긴다. 단일 출처로 막는다.
//
// 핸들러는 raw 데이터를 그대로 돌려준다 — JSON 텍스트로 감싸는 건 어댑터의 몫이다.
// (namory 는 "멍청하게" 데이터만 준다. 해석·요약은 클라이언트 Claude 가 한다.)

import { z } from "zod";
import { CATEGORIES } from "../db/schema.js";
import { save } from "./save.js";
import { recall } from "./recall.js";
import { recent } from "./recent.js";
import { pattern } from "./pattern.js";
import { profileShow, profileUpdate } from "./profile.js";
import { update } from "./update.js";
import { remove } from "./remove.js";
import { todos } from "./todos.js";
import { graphify } from "./graphify.js";

const category = z.enum(CATEGORIES);
// 프로젝트 스코프(선택). 저장 시 태그, 조회 시 "그 프로젝트 + 개인 기억"으로 좁힌다.
const project = z
  .string()
  .min(1)
  .optional()
  .describe("프로젝트 스코프 (선택). 예: navis. 조회 시 해당 프로젝트+개인 기억만.");

// 도구 하나의 정의. inputSchema 는 zod raw shape(객체 리터럴) — MCP SDK 와
// Agent SDK 의 tool() 이 둘 다 이 형태를 받는다.
export interface MemoryTool {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, never>) => Promise<unknown>;
}

// 핸들러 인자는 zod 스키마로 이미 검증된 값이라 호출부마다 타입이 다르다.
// 레지스트리는 도구를 "목록"으로 다루는 게 목적이므로 경계에서 한 번만 느슨하게 둔다.
function define<S extends z.ZodRawShape>(t: {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}): MemoryTool {
  return t as unknown as MemoryTool;
}

export const MEMORY_TOOLS: MemoryTool[] = [
  define({
    name: "save",
    title: "기억 저장 (save / store memory)",
    description:
      "결정·배움·아이디어·감정·사람·할 일에 대한 기록(memory/note/todo)을 임베딩과 함께 저장한다 (save / store / remember). category가 todo면 '안 끝난 할 일'로 시작한다. " +
      "기본 동작은 중복 방지 — 임계값 이상 유사 기억이 있으면 저장하지 않고 응답의 duplicates에 후보를 담아 skipped:true로 반환한다. " +
      "그 경우 update(병합) 또는 그대로 두기를 결정. 의도적으로 중복을 허용하려면 skipIfDuplicate:false 명시.",
    inputSchema: {
      content: z.string().min(1).describe("저장할 내용 (한 문장 이상 권장)"),
      category: category.optional().describe("분류 (선택). todo = 할 일"),
      project,
      source: z
        .string()
        .optional()
        .describe("출처 (예: claude-desktop, claude-ios)"),
      skipIfDuplicate: z
        .boolean()
        .optional()
        .describe(
          "기본 true — 유사 기억이 있으면 저장하지 않고 후보만 반환(skipped:true). 의도적 중복 허용 시 false.",
        ),
      tags: z
        .array(z.string())
        .optional()
        .describe("태그 목록 (예: ['navis', 'architecture'])"),
      related_ids: z.array(z.string()).optional().describe("연결할 기억의 id 목록"),
    },
    handler: (args) => save(args),
  }),

  define({
    name: "recall",
    title: "의미 검색 (recall / semantic search)",
    description:
      "질의와 의미적으로 가까운 기억(memory)을 벡터 검색으로 찾는다 (recall / search / find).",
    inputSchema: {
      query: z.string().min(1).describe("찾고 싶은 내용/주제"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("최대 개수 (기본 5)"),
      category: category.optional().describe("분류 필터 (선택)"),
      project,
      withRelated: z
        .boolean()
        .optional()
        .describe("true면 연결된 기억(related_ids)도 함께 반환"),
    },
    handler: (args) => recall(args),
  }),

  define({
    name: "recent",
    title: "최근 기억 (recent memories)",
    description:
      "최근 N일간의 기억(memory)을 시간 역순으로 가져온다 (recent / latest / history).",
    inputSchema: {
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe("거슬러 볼 일수 (기본 7)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("최대 개수 (기본 50)"),
      category: category.optional().describe("분류 필터 (선택)"),
      project,
    },
    handler: (args) => recent(args),
  }),

  define({
    name: "pattern",
    title: "패턴 익스플로러 (pattern explorer)",
    description:
      "기간/카테고리로 묶은 raw 기억(memory)을 시간순으로 반환한다 (pattern / trend / explore). 패턴 해석·요약은 클라이언트(Claude)가 수행한다.",
    inputSchema: {
      period: z.enum(["week", "month"]).optional().describe("집계 기간 (기본 week)"),
      category: category.optional().describe("분류 필터 (선택)"),
      project,
    },
    handler: ({ period, category: cat, project: proj }) => {
      const days = period === "month" ? 30 : 7;
      const since = new Date(Date.now() - days * 86_400_000);
      return pattern({ since, category: cat, project: proj });
    },
  }),

  define({
    name: "profile_show",
    title: "자기 이해 조회 (profile show)",
    description:
      "누적된 자기 이해 프로필(self-understanding profile)을 섹션별로 조회한다 (profile / show / get).",
    inputSchema: {},
    handler: () => profileShow(),
  }),

  define({
    name: "profile_update",
    title: "자기 이해 갱신 (profile update)",
    description:
      "Claude가 누적 기억을 보고 작성한 섹션 텍스트를 저장한다 (profile / update). 서버는 저장만 — 작성은 Claude.",
    inputSchema: {
      section: z
        .string()
        .min(1)
        .describe("섹션명 (values / patterns / goals ...)"),
      content: z.string().min(1).describe("섹션 본문"),
    },
    handler: (args) => profileUpdate(args),
  }),

  define({
    name: "update",
    title: "기억 정정/완료 (update / edit / complete)",
    description:
      "기존 기억을 id로 수정한다 (update / edit / fix). content를 바꾸면 임베딩을 재계산하고, done으로 할 일을 완료/미완료 처리한다 (complete / done / reopen).",
    inputSchema: {
      id: z.string().min(1).describe("수정할 기억의 id"),
      content: z.string().min(1).optional().describe("새 본문 (바꾸면 재임베딩)"),
      category: category.optional().describe("새 분류"),
      done: z
        .boolean()
        .optional()
        .describe("할 일 완료 여부 (true=완료, false=다시 열기)"),
      project: z
        .string()
        .optional()
        .describe("프로젝트 재태깅 (빈 문자열이면 개인 기억으로 되돌림)"),
      tags: z.array(z.string()).optional().describe("새 태그 목록 (기존 교체)"),
      related_ids: z
        .array(z.string())
        .optional()
        .describe("새 연결 id 목록 (기존 교체)"),
    },
    handler: (args) => update(args),
  }),

  define({
    name: "delete",
    title: "기억 삭제 (delete / remove)",
    description:
      "틀렸거나 필요 없어진 기억을 id로 영구 삭제한다 (delete / remove / forget).",
    inputSchema: {
      id: z.string().min(1).describe("삭제할 기억의 id"),
    },
    handler: (args) => remove(args),
  }),

  define({
    name: "todos",
    title: "할 일 목록 (todos / tasks)",
    description:
      "할 일(todo)을 시간 역순으로 가져온다 (todos / tasks / to-do). 기본은 안 끝난 것만 보여준다.",
    inputSchema: {
      includeDone: z
        .boolean()
        .optional()
        .describe("완료한 할 일도 포함할지 (기본 false = 미완료만)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("최대 개수 (기본 50)"),
      project,
    },
    handler: (args) => todos(args),
  }),

  define({
    name: "graphify",
    title: "기억 그래프 (graphify)",
    description:
      "모든 기억을 노드·엣지 그래프로 반환한다. nodes = 기억 목록(tags 포함), edges = related_ids 연결, tag_groups = 태그별 기억 id 목록. 지식 그래프 시각화·탐색에 사용.",
    inputSchema: {
      project,
      category: category.optional().describe("분류 필터 (선택)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("최대 노드 수 (기본 300)"),
    },
    handler: (args) => graphify(args),
  }),
];
