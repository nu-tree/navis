// ── 워밍 세션: 타입·저장소·수명주기 ──────────────────────────────────────────
// 워밍 세션의 자료구조(WarmSession), 전역 저장소(sessions/creating), 입력 채널,
// 생성/폐기 등 수명주기 전반을 담당한다. 턴 실행 로직은 turn.ts 가 이 모듈을 쓴다.

import { query, type SDKUserMessage, type Query } from "@anthropic-ai/claude-agent-sdk";
import { getChatPrefetch } from "../prefetch.js";
import {
  buildChatSystemPrompt,
  buildChatQueryOptions,
} from "../query-options.js";
import { IDLE_MS, MAX_SESSIONS, WarmCapacity } from "./config.js";

export interface WarmSession {
  q: Query;
  push: (m: SDKUserMessage) => void;
  closeInput: () => void;
  abort: AbortController;
  model: string;
  busy: boolean;
  lastUsed: number;
  // 직전 턴이 돌려준 SDK 세션 id — resume 일치 확인용(불일치면 세션 리셋으로 간주).
  sdkSessionId: string;
}

export const sessions = new Map<string, WarmSession>();
// 생성 중인 세션의 in-flight promise — 같은 대화로 동시 요청이 들어와도 세션을 두 번
// 만들어 한쪽이 teardown 없이 누수되는 race 를 막는다(둘 다 같은 세션을 받는다).
const creating = new Map<string, Promise<WarmSession>>();

export async function acquireNewSession(
  conversationId: string,
  model: string,
  resume: string | undefined,
): Promise<WarmSession> {
  let pending = creating.get(conversationId);
  if (!pending) {
    pending = createSession(conversationId, model, resume).finally(() =>
      creating.delete(conversationId),
    );
    creating.set(conversationId, pending);
  }
  return pending;
}

// 입력 채널 — push 된 사용자 메시지를 query() 가 소비할 async iterable 로 흘린다.
function createInput(): {
  stream: AsyncGenerator<SDKUserMessage>;
  push: (m: SDKUserMessage) => void;
  close: () => void;
} {
  const queue: SDKUserMessage[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  async function* stream(): AsyncGenerator<SDKUserMessage> {
    for (;;) {
      while (queue.length === 0 && !closed) {
        await new Promise<void>((resolve) => {
          // lost-wakeup 방지: wake 등록 직전(=Promise executor 내부의 동기 구간) 큐를
          // 한 번 더 확인하고, 비어있지 않거나 이미 닫혔으면 즉시 resolve 해서 다음
          // 루프로 진행. 큐 확인과 wake 등록 사이에 비동기 경계가 없어야 push 가
          // wake=null 인 사이에 들어와 큐에 쌓이고 영영 yield 되지 않는 경우를 막는다.
          if (queue.length > 0 || closed) {
            resolve();
            return;
          }
          wake = resolve;
        });
      }
      if (queue.length === 0 && closed) return;
      yield queue.shift()!;
    }
  }
  return {
    stream: stream(),
    push(m) {
      // close 후 들어온 push 는 무시 — 세션 폐기(teardown→closeInput) 후 미처 들어온
      // 마지막 메시지가 큐에 쌓여 영영 yield 되지 않거나, 새 세션이 옛 큐 메시지를
      // 잘못 소비하는 일을 막는다(생성 race / 폐기 잔재 메시지 방어).
      if (closed) return;
      queue.push(m);
      wake?.();
      wake = null;
    },
    close() {
      closed = true;
      wake?.();
      wake = null;
    },
  };
}

export function userMessage(text: string): SDKUserMessage {
  return { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null };
}

function teardown(session: WarmSession): void {
  try {
    session.closeInput();
  } catch {
    /* ignore */
  }
  try {
    // return() 자체가 동기적이지만 SDK 가 Promise 를 돌려주는 경우가 있어 catch 부착 —
    // 폐기 경로에서 unhandled rejection 이 새지 않게.
    const ret = session.q.return(undefined);
    if (ret && typeof (ret as Promise<unknown>).catch === "function") {
      (ret as Promise<unknown>).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  try {
    session.abort.abort();
  } catch {
    /* ignore */
  }
}

export function dropSession(conversationId: string): void {
  const s = sessions.get(conversationId);
  if (s) {
    teardown(s);
    sessions.delete(conversationId);
  }
}

// 새 워밍 세션 생성. 옵션은 askClaude(콜드)와 동일한 공유 빌더로 만들어 설정이 어긋나지
// 않게 한다. query() 는 게으르게 시작 — 첫 push+next() 때 비로소 프로세스를 스폰한다.
async function createSession(
  conversationId: string,
  model: string,
  resume: string | undefined,
): Promise<WarmSession> {
  // 상한 초과 시 가장 오래 안 쓴 세션부터 폐기. 폐기 가능 후보(=busy 아님)가 하나도
  // 없으면(모든 세션이 동시에 busy) WarmCapacity 를 던져 호출부가 콜드로 폴백하게
  // 한다. 옛 버전은 후보가 없어도 sessions.set 으로 새 세션을 만들어 MAX_SESSIONS 를
  // 초과한 채 Claude CLI 서브프로세스가 무제한 상주하던 버그가 있었음.
  // → query() 를 띄우기 전에 용량 체크를 먼저 해서 실패 시 SDK 프로세스 스폰 자체를 피한다.
  if (sessions.size >= MAX_SESSIONS) {
    let oldestId: string | undefined;
    let oldest = Infinity;
    for (const [id, s] of sessions) {
      if (!s.busy && s.lastUsed < oldest) {
        oldest = s.lastUsed;
        oldestId = id;
      }
    }
    if (!oldestId) throw new WarmCapacity();
    dropSession(oldestId);
  }
  const [connectors, baseSystemPrompt, guidance] = await getChatPrefetch();
  const input = createInput();
  const abort = new AbortController();
  const q = query({
    prompt: input.stream,
    options: {
      model,
      // 공통 옵션(systemPrompt/mcpServers/allowedTools/settingSources/maxTurns/
      // includePartialMessages/abortController/resume)은 콜드/워밍 공유 빌더로 통일 —
      // 어느 한쪽만 바꿔도 두 경로가 어긋나던 위험(파일 상단 주석 참조)을 단일 출처로 막는다.
      // 채팅 경로 = projectContext 없음, allowProfileUpdate=false(인젝션 방어).
      // 워밍 첫 턴은 앱이 보낸 직전 세션을 이어받는다(콜드 경로와 동일 연속성).
      // 이후 턴부터는 살아있는 세션 자체가 맥락이라 resume 불필요.
      ...buildChatQueryOptions(connectors, buildChatSystemPrompt(baseSystemPrompt, guidance), {
        resume,
        abortController: abort,
        allowProfileUpdate: false,
        includePartial: true,
      }),
    },
  });
  // 갓 만든 세션은 첫 턴을 claim 하기 전까진 busy=false 이고 lastUsed 가 "현재"라
  // 동시 acquire 가 들어와도 가장 최근이라 LRU 의 타깃이 되지 않는다. 그래도 한 틱이라도
  // 보수적으로 보호하기 위해 lastUsed 를 충분히 미래로(=now + IDLE_MS) 놓는다.
  // 첫 runWarmTurn 종료 시 정상 lastUsed = Date.now() 로 되돌린다.
  const session: WarmSession = {
    q,
    push: input.push,
    closeInput: input.close,
    abort,
    model,
    busy: false,
    lastUsed: Date.now() + IDLE_MS,
    sdkSessionId: "",
  };
  sessions.set(conversationId, session);
  return session;
}

// 유휴 세션 청소 — 프로세스를 붙잡지 않도록 unref.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (!s.busy && now - s.lastUsed > IDLE_MS) dropSession(id);
  }
}, 60_000);
sweep.unref?.();
