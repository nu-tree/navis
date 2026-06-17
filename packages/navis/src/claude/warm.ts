import { query, type SDKUserMessage, type Query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config.js";
import { getChatPrefetch } from "./prefetch.js";
import { applySaveNudge } from "./nudge.js";
import {
  buildChatSystemPrompt,
  buildChatMcpServers,
  buildChatAllowedTools,
  newTurnAccumulator,
  processChatMessage,
  type TurnCallbacks,
} from "./ask.js";
import type { AskResult } from "./types.js";

// ── 워밍 세션 ────────────────────────────────────────────────────────────────
// 매 메시지마다 CLI 프로세스를 새로 스폰하고 모든 MCP 서버를 핸드셰이크하던 비용
// (첫 토큰 ~1.6s 바닥, 모델 무관)을 없애기 위해, 대화별로 query() 세션을 streaming-input
// 모드로 "살려둔다". 2번째 메시지부터는 같은 프로세스·연결을 재사용해 스폰+핸드셰이크를
// 통째로 건너뛴다.
//
// 안전장치:
//  - 기본 비활성(NAVIS_WARM_SESSIONS=1 일 때만). 켜도 실패 시 콜드 askClaude 로 폴백.
//  - 단일 비행(한 대화는 동시에 한 턴만) — 겹치면 그 메시지는 콜드 폴백.
//  - 모델 변경/세션 리셋(resume 불일치)/컨텍스트 한도 초과 시 세션 폐기 후 재생성.
//  - 유휴 타임아웃·최대 세션 수 제한으로 메모리 관리.
//  - 이미지/확장사고(thinking) 턴은 워밍 대상에서 제외(호출부가 콜드로 보냄).

const IDLE_MS = 10 * 60_000; // 10분 유휴 시 세션 폐기
// 동시 워밍 세션 상한(초과 시 LRU 폐기). 워밍 세션 하나당 Claude CLI 서브프로세스가
// 상주하므로, 작은 인스턴스(Railway hobby)에선 이 값이 크면 CPU/메모리가 고갈돼 이벤트
// 루프가 굶고 응답이 분 단위로 느려질 수 있다. NAVIS_WARM_MAX_SESSIONS 로 인스턴스
// 크기에 맞춰 조절(미설정 시 40). 단일 사용자/작은 플랜은 2~3 권장.
const MAX_SESSIONS = (() => {
  const n = Number.parseInt(process.env.NAVIS_WARM_MAX_SESSIONS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 40;
})();
// 한 턴 wall-clock 상한. streaming-input 가정(턴마다 result 1개)이 틀려 result 가 영영
// 안 와도 무한 행을 막는 안전 backstop — 정상 턴엔 안 닿게 넉넉히(도구 루프 포함).
const TURN_TIMEOUT_MS = 5 * 60_000;

export function warmEnabled(): boolean {
  const v = process.env.NAVIS_WARM_SESSIONS;
  return v === "1" || v === "true";
}

// 워밍 경로가 "이 턴을 콜드로 돌려라"라고 신호하는 에러. 스트리밍을 시작하기 전에만
// 던진다(이미 델타를 흘린 뒤엔 폴백이 중복을 만들므로 일반 에러로 전파).
export class WarmFallback extends Error {
  constructor(reason: string) {
    super(`warm-fallback: ${reason}`);
    this.name = "WarmFallback";
  }
}

interface WarmSession {
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

const sessions = new Map<string, WarmSession>();
// 생성 중인 세션의 in-flight promise — 같은 대화로 동시 요청이 들어와도 세션을 두 번
// 만들어 한쪽이 teardown 없이 누수되는 race 를 막는다(둘 다 같은 세션을 받는다).
const creating = new Map<string, Promise<WarmSession>>();

async function acquireNewSession(
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

// LRU 폐기 후보가 없을 때(상한에 도달했고 모든 세션이 busy) createSession 이 던지는
// 신호. 호출부(runWarmTurn)가 받아서 WarmFallback 으로 변환해 콜드 askClaude 로 폴백한다.
// 예전에는 후보가 없으면 그냥 sessions.set 으로 진행해 MAX_SESSIONS 를 초과한 채
// Claude CLI 서브프로세스가 무제한 상주하던 버그가 있었음.
class WarmCapacity extends Error {
  constructor() {
    super("warm-capacity: all sessions busy, cannot evict");
    this.name = "WarmCapacity";
  }
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

function userMessage(text: string): SDKUserMessage {
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

function dropSession(conversationId: string): void {
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
      // 채팅 경로 = projectContext 없음, allowProfileUpdate=false(인젝션 방어).
      systemPrompt: buildChatSystemPrompt(baseSystemPrompt, guidance),
      mcpServers: buildChatMcpServers(connectors),
      allowedTools: buildChatAllowedTools(connectors, false),
      settingSources: [],
      maxTurns: 16,
      includePartialMessages: true,
      abortController: abort,
      // 워밍 첫 턴은 앱이 보낸 직전 세션을 이어받는다(콜드 경로와 동일 연속성).
      // 이후 턴부터는 살아있는 세션 자체가 맥락이라 resume 불필요.
      ...(resume ? { resume } : {}),
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

// 한 턴을 워밍 세션으로 실행. 실패가 스트리밍 시작 전이면 WarmFallback 을 던져 호출부가
// 콜드 askClaude 로 안전하게 폴백하게 한다.
export async function runWarmTurn(opts: {
  conversationId: string;
  prompt: string;
  model: string;
  // 앱이 보낸 resume(직전 SDK 세션 id). 세션의 것과 다르면 리셋으로 보고 폐기+재생성.
  resume: string | undefined;
  callbacks: TurnCallbacks;
}): Promise<AskResult> {
  const { conversationId, prompt, model, resume, callbacks } = opts;

  let session = sessions.get(conversationId);
  // 점유 중이 아닌 세션만 stale(모델 변경·세션 리셋) 판정 후 폐기 — 점유 중이면 아래
  // claim 에서 busy 폴백된다.
  if (session && !session.busy) {
    const stale =
      session.model !== model || (session.sdkSessionId !== "" && resume !== session.sdkSessionId);
    if (stale) {
      dropSession(conversationId);
      session = undefined;
    }
  }

  if (!session) {
    try {
      session = await acquireNewSession(conversationId, model, resume);
    } catch (err) {
      dropSession(conversationId);
      // 용량 초과(모든 세션이 busy) — 새 세션을 강제로 만들면 상한이 무너진다. 콜드 폴백.
      if (err instanceof WarmCapacity) {
        throw new WarmFallback("capacity-full");
      }
      throw new WarmFallback(`create-failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 단일 비행 claim — await 직후 동기 구간에서 원자적으로. 이미 다른 턴이 점유 중이면
  // (같은 대화 동시 요청, 또는 방금 같은 새 세션을 받은 경쟁 호출) 이 턴은 콜드로.
  if (session.busy) throw new WarmFallback("busy");
  session.busy = true;

  const t0 = Date.now();
  const acc = newTurnAccumulator(t0);
  // 턴 wall-clock 상한 — result 가 영영 안 와도 무한 행을 막는다(타임아웃 시 세션 폐기).
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("warm-turn-timeout")), TURN_TIMEOUT_MS);
  });
  try {
    session.push(userMessage(applySaveNudge(prompt)));
    for (;;) {
      // Promise.race 의 패자 쪽(주로 next())이 나중에 reject 하면 unhandled rejection 이
      // 되므로 미리 .catch 부착. 결과 자체는 racer 가 본다.
      const nextPromise = session.q.next();
      nextPromise.catch(() => {});
      const next = await Promise.race([nextPromise, timeout]);
      if (next.done) throw new Error("워밍 세션 조기 종료");
      if (processChatMessage(next.value, acc, callbacks)) break; // result 도달 → 턴 종료
    }
  } catch (err) {
    session.busy = false;
    dropSession(conversationId);
    if (err instanceof WarmFallback) throw err;
    // 클라이언트로 출력을 아직 안 흘렸으면(emitted=false) 콜드 폴백이 안전(델타 중복 없음).
    // 이미 흘린 뒤면 폴백 불가 — 일반 에러로 전파.
    throw !acc.emitted
      ? new WarmFallback(`turn-error: ${err instanceof Error ? err.message : String(err)}`)
      : err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  session.busy = false;
  session.lastUsed = Date.now();
  session.sdkSessionId = acc.sessionId;
  const totalMs = Date.now() - t0;
  console.log(
    `[chat:timing] WARM model=${model} firstMsg=${acc.firstMsgMs}ms total=${totalMs}ms tools=${acc.toolsUsed.length} conv=${conversationId.slice(0, 8)}`,
  );

  // 컨텍스트가 한도를 넘으면 다음 턴은 새 세션으로(앱도 contextFull 로 세션을 리셋한다).
  if (acc.contextTokens >= config.contextTokenLimit) dropSession(conversationId);

  return {
    text: acc.text.trim() || "(빈 응답)",
    sessionId: acc.sessionId,
    contextTokens: acc.contextTokens,
    saved: acc.saved,
    toolsUsed: acc.toolsUsed,
    // prefetch 는 세션 생성 시 1회뿐이라 턴 단위론 0 으로 보고(워밍 이득은 firstMsg 에 드러남).
    timing: { prefetchMs: 0, firstMsgMs: acc.firstMsgMs, totalMs },
  };
}

// 대화가 끊겼을 때(중지·삭제) 워밍 세션을 즉시 폐기 — 외부에서 호출.
export function dropWarmSession(conversationId: string): void {
  dropSession(conversationId);
}

// 유휴 세션 청소 — 프로세스를 붙잡지 않도록 unref.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (!s.busy && now - s.lastUsed > IDLE_MS) dropSession(id);
  }
}, 60_000);
sweep.unref?.();
