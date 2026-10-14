// 약속 도구 — in-process MCP 서버 둘(specs/003 contracts/promise-tools.md).
//
//   promise      — 대화 턴에 붙는다. 약속을 만들고 · 보고 · 고치고 · 지운다.
//   promise_run  — 약속 턴에만 붙는다. 사용자에게 말하기(notify) · 메모 · 끝내기.
//
// ★ 둘 다 외부 MCP(/mcp)에 열지 않는다(헌장 보안 절, FR-029). createMemoryMcpServer 와 따로 둔 이유다.
// ★ 회원 id 는 서버를 만들 때 받는다. 도구 입력에는 없다 — 모델이 남의 회원을 고를 자리가 없다.
// ★ allowedTools 에 함께 넘겨야 핸들러가 돈다(memory/mcp.ts 주석) — ALLOWED_* 를 쓴다.

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import {
  finishInputSchema,
  notifyInputSchema,
  promiseCreateInputSchema,
  promiseIdInputSchema,
  promiseListInputSchema,
  promiseUpdateInputSchema,
  setMemoInputSchema,
  type PromiseItem,
} from "@navis/validation";
import { isNotFound, isPromiseLimit, isScheduleInvalid } from "../errors";
import { deliver } from "./deliver";
import { create, formatKst, list, remove, update, type PromiseWithUpcoming } from "./index";

export const PROMISE_SERVER_NAME = "promise";
export const PROMISE_RUN_SERVER_NAME = "promise_run";

const PROMISE_TOOL_NAMES = ["create", "list", "update", "cancel"] as const;
const PROMISE_RUN_TOOL_NAMES = ["notify", "set_memo", "finish"] as const;

export const ALLOWED_PROMISE_TOOLS: string[] = PROMISE_TOOL_NAMES.map(
  (n) => `mcp__${PROMISE_SERVER_NAME}__${n}`,
);
export const ALLOWED_PROMISE_RUN_TOOLS: string[] = PROMISE_RUN_TOOL_NAMES.map(
  (n) => `mcp__${PROMISE_RUN_SERVER_NAME}__${n}`,
);

const reply = (text: string) => ({ content: [{ type: "text" as const, text }] });
// 사용자가 고칠 수 있는 거절(지난 시각 · 상한 · 없는 약속)은 이유를 모델에게 돌려준다 — 되묻게.
const refuse = (text: string) => ({ ...reply(text), isError: true });

/** 고칠 수 있는 거절이면 그 말로, 아니면 던진다(SDK 가 오류로 전달). */
const refuseKnown = (err: unknown) => {
  if (isScheduleInvalid(err) || isPromiseLimit(err)) return refuse(err.message);
  if (isNotFound(err)) return refuse("그 약속은 없어요. list 로 id 를 확인하세요.");
  throw err;
};

const scheduleText = (p: PromiseItem) =>
  p.schedule.kind === "once" ? "한 번" : p.schedule.description;

const stateText = (p: PromiseItem) => (p.enabled ? "켜짐" : p.endedAt ? "끝남" : "꺼짐");

const line = (p: PromiseItem) => {
  const next = p.nextRunAt ? formatKst(new Date(p.nextRunAt)) : "없음";
  const last = p.recentRuns[0];
  const lastText = last ? `${last.status}${last.error ? `(${last.error})` : ""}` : "아직 없음";
  return `- ${p.label} · ${scheduleText(p)} · 다음 ${next} · ${stateText(p)} · 최근 ${lastText} (id=${p.id})`;
};

const savedText = (verb: string, { promise, upcoming }: PromiseWithUpcoming) =>
  [
    `${verb}. id=${promise.id} label=${promise.label} 상태=${stateText(promise)}`,
    `일정: ${scheduleText(promise)}`,
    `다음 실행: ${upcoming.length ? upcoming.map(formatKst).join(", ") : "없음"}`,
    "사용자에게 실제 일정을 한 줄로 확인해 준다.",
  ].join("\n");

export type PromiseMcpContext = {
  userId: string;
  /** 지금 대화방 — 약속을 만든 곳으로 남긴다. 초안 방이면 null. */
  conversationId: string | null;
};

export const createPromiseMcpServer = ({ userId, conversationId }: PromiseMcpContext) =>
  createSdkMcpServer({
    name: PROMISE_SERVER_NAME,
    version: "0.1.0",
    instructions:
      "사용자와의 약속(정해진 때에 나비스가 먼저 할 일)을 다룬다. 사용자가 요청하거나 제안에 동의했을 때만 만든다.",
    tools: [
      tool(
        "create",
        [
          "약속을 만든다 — 정해진 때에 네가 instruction 을 받아 다시 생각하고, 필요하면 사용자에게 먼저 말을 건다.",
          "",
          "부를 때: 사용자가 미래의 어느 때 무언가를 해 달라고 할 때('내일 3시에 알려줘', '매일 밤 9시에 유가 봐줘'),",
          "또는 네가 제안한 약속에 사용자가 동의했을 때. **요청이나 동의 없이는 부르지 않는다.**",
          "",
          "instruction: 실행 때의 네가 이 문장만 보고 할 일을 알 수 있게 완결된 문장으로 쓴다(누가 · 무엇을 · 어떤 조건에서 알릴지).",
          "label: 화면에 보일 짧은 요약(40자 이내).",
          "schedule: 한 번이면 { at: 오프셋이 있는 ISO 시각, 예 2026-10-15T15:00:00+09:00 }, 반복이면 { cron: 한국 시간 기준 cron }.",
          "'저녁' 처럼 애매하면 구체 시각을 정하고(저녁=19:00) 확인 문장에 적는다. 반복 간격은 최소 1시간이다.",
          "지금 시각은 사용자 메시지 앞의 [지금: …] 을 본다.",
        ].join("\n"),
        promiseCreateInputSchema.shape,
        async (args) => {
          try {
            return reply(savedText("약속을 만들었다", await create(userId, args, conversationId)));
          } catch (err) {
            return refuseKnown(err);
          }
        },
      ),
      tool(
        "list",
        "사용자의 약속 목록. '걸어둔 약속 뭐 있어?' 에 쓰고, 고치거나 지우기 전에 id 를 찾을 때 쓴다.",
        promiseListInputSchema.shape,
        async (args) => {
          const items = await list(userId, args);
          return reply(items.length ? `약속 ${items.length}개:\n${items.map(line).join("\n")}` : "약속이 없다.");
        },
      ),
      tool(
        "update",
        [
          "약속을 고치거나 끄고 켠다. 준 필드만 바뀐다.",
          "'꺼줘' 는 enabled=false, '다시 켜줘' 는 enabled=true. 어느 약속인지 애매하면 list 로 보고 되묻는다.",
        ].join("\n"),
        promiseUpdateInputSchema.shape,
        async (args) => {
          try {
            return reply(savedText("약속을 고쳤다", await update(userId, args)));
          } catch (err) {
            return refuseKnown(err);
          }
        },
      ),
      tool(
        "cancel",
        "약속을 지운다. 사용자가 **지우라고** 할 때만 — '꺼줘' 는 update(enabled=false) 다.",
        promiseIdInputSchema.shape,
        async ({ id }) => {
          try {
            await remove(userId, id);
            return reply(`약속을 지웠다. id=${id}`);
          } catch (err) {
            return refuseKnown(err);
          }
        },
      ),
    ],
  });

/** 약속 턴 한 번 동안 도구가 남긴 것. run.ts 가 실행 결과로 옮긴다. 턴마다 새로 만든다. */
export type PromiseRunState = {
  /** notify 로 남긴 메시지. 있으면 이번 실행은 "말함"이다. */
  messageId?: string;
  memo?: string;
  finished?: boolean;
};

export type PromiseRunMcpContext = {
  userId: string;
  promiseId: string;
  label: string;
  state: PromiseRunState;
};

export const createPromiseRunMcpServer = ({ userId, promiseId, label, state }: PromiseRunMcpContext) =>
  createSdkMcpServer({
    name: PROMISE_RUN_SERVER_NAME,
    version: "0.1.0",
    instructions: "약속을 실행하는 동안만 쓰는 도구다. 사용자에게 말을 거는 길은 notify 하나뿐이다.",
    tools: [
      tool(
        "notify",
        [
          "사용자에게 말을 건다 — '나비스' 방에 네 메시지가 올라가고 알림이 간다.",
          "사용자가 알아야 할 것이 있을 때만 부른다. 부르지 않으면 아무것도 전해지지 않는다 — 그게 정상이다.",
          "한 번 실행에 한 번만 부를 수 있다. 할 말을 한 메시지에 담는다.",
        ].join("\n"),
        notifyInputSchema.shape,
        async ({ text }) => {
          if (state.messageId) return refuse("이번 실행에서는 이미 말했어요.");
          const message = await deliver(userId, { kind: "promise", promiseId, label }, text);
          state.messageId = message.id;
          return reply("전했다.");
        },
      ),
      tool(
        "set_memo",
        "이 약속의 메모를 통째로 바꾼다. 다음 실행이 이 메모를 본다 — 지난번에 본 값 · 이미 알린 것을 남긴다.",
        setMemoInputSchema.shape,
        async ({ memo }) => {
          state.memo = memo;
          return reply("메모를 남겼다.");
        },
      ),
      tool(
        "finish",
        "이 약속을 끝낸다. 한 번만 알리면 되는 감시 약속이 목적을 이뤘을 때 쓴다.",
        finishInputSchema.shape,
        async () => {
          state.finished = true;
          return reply("약속을 끝냈다.");
        },
      ),
    ],
  });
