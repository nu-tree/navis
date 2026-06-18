import { upsertConversationRemote } from "../conversations/api.js";
import { invalidateConversationsCache } from "./conversations.js";
import { publishToNtfy } from "../reports/ntfy.js";

// 진행 중인 챗 생성의 AbortController 레지스트리. 명시적 중지(/api/chat/cancel)만
// 생성을 끊는다 — 클라 연결이 끊겨도(폰 백그라운드/잠금) 생성은 계속돼, 완료 후
// 서버가 응답을 대화에 써넣고(영속) 폰으로 푸시한다(보고서와 동일 경로). 이로써
// "질문 보내고 폰 내려놔도 답이 끝나면 알림 + 다시 열면 답변이 보임" 이 성립한다.
const inflight = new Map<string, AbortController>();

// 중지 신호를 받은 turnId 들(짧은 TTL). 중지 요청이 생성 완료 '직후'에 도착해
// abort 가 무의미해진 레이스에서도, 완료 분기가 이 셋을 확인해 영속/푸시를 건너뛴다
// (사용자가 멈췄는데 답이 저장·푸시되는 걸 막는다).
const cancelled = new Set<string>();
const CANCEL_TTL_MS = 60_000;

// 앱이 백그라운드로 전환되며 명시적으로 핸드오프를 알린 turnId 들(긴 TTL — 한 턴이
// 끝날 때까지 살아 있어야 한다). Railway 프록시 뒤에선 폰이 끊겨도 req 'close'
// (clientGone)가 안 뜨는 경우가 있어, TCP 끊김 감지만으로는 백그라운드 완주가 안 탄다.
// 앱이 AppState 'background' 에서 이 신호를 보내, 완료 분기가 영속+푸시를 확실히 타게 한다.
const handoff = new Set<string>();
const HANDOFF_TTL_MS = 10 * 60_000;

export function registerTurn(turnId: string, ctrl: AbortController): void {
  if (turnId) inflight.set(turnId, ctrl);
}

export function clearTurn(turnId: string): void {
  if (turnId) inflight.delete(turnId);
}

// 명시적 중지 — 해당 턴 생성을 끊는다(진행 중이면). 완료 직후라 컨트롤러가 없어도
// cancelled 에 표시해 두어, 완료 분기의 영속/푸시를 막는다. 항상 true 로 본다.
export function cancelTurn(turnId: string): boolean {
  if (!turnId) return false;
  cancelled.add(turnId);
  setTimeout(() => cancelled.delete(turnId), CANCEL_TTL_MS);
  const ctrl = inflight.get(turnId);
  if (ctrl) {
    ctrl.abort();
    inflight.delete(turnId);
  }
  return true;
}

// 이 턴이 중지됐는지 확인하고 표시를 소거한다(1회성). 완료 분기에서 호출.
export function consumeCancelled(turnId: string): boolean {
  if (!turnId || !cancelled.has(turnId)) return false;
  cancelled.delete(turnId);
  return true;
}

// 앱이 "백그라운드로 떠난다"고 명시적으로 알림 — 완료 분기가 clientGone 과 동등하게
// 취급해 영속+푸시를 타게 한다(프록시가 끊김을 가려도 안전). TTL 로 자동 청소.
export function markHandoff(turnId: string): void {
  if (!turnId) return;
  handoff.add(turnId);
  setTimeout(() => handoff.delete(turnId), HANDOFF_TTL_MS);
}

// 이 턴이 핸드오프됐는지 확인하고 표시를 소거한다(1회성). 완료 분기에서 호출.
export function consumeHandoff(turnId: string): boolean {
  if (!turnId || !handoff.has(turnId)) return false;
  handoff.delete(turnId);
  return true;
}

// 소거 없이 핸드오프 여부만 확인(peek). 연결 종료 후 "버려진 요청 vs 백그라운드 의도"를
// 가르는 데 쓴다 — 완료 분기의 consumeHandoff 와 별개라 레이스가 없다.
export function hasHandoff(turnId: string): boolean {
  return !!turnId && handoff.has(turnId);
}

// 대화 메시지의 최소 보존 형태. namory 동기화 머지(LWW) 가 신뢰할 수 있는 필드만.
// 잡 필드(예: 디버그 메타)는 의도적으로 버린다 — 서버가 권위 응답을 써넣을 때 깔끔하게.
export type NormalizedMessage = {
  id: string;
  role: string;
  text: string;
  createdAt: string;
  toolsUsed?: string[];
};

// 클라가 보낸 conversation snapshot.messages(unknown[])를 신뢰하지 않고 한 번에 정규화한다.
// 잡 필드 무시 + 핵심 4필드(id/role/createdAt/text) 가 정상이 아닌 원소는 제거.
// 이 함수의 산출물은 그대로 namory 로 upsert 되므로 형태가 권위 있는 진실이 된다.
export function normalizeSnapshotMessages(arr: unknown): NormalizedMessage[] {
  if (!Array.isArray(arr)) return [];
  const out: NormalizedMessage[] = [];
  for (const m of arr) {
    if (!m || typeof m !== "object") continue;
    const o = m as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id ? o.id : "";
    const role = typeof o.role === "string" && o.role ? o.role : "";
    const text = typeof o.text === "string" ? o.text : "";
    const createdAt = typeof o.createdAt === "string" && o.createdAt ? o.createdAt : "";
    // text 는 빈 문자열 허용(이미지/도구-only 메시지). id/role/createdAt 은 필수.
    if (!id || !role || !createdAt) continue;
    const norm: NormalizedMessage = { id, role, text, createdAt };
    if (Array.isArray(o.toolsUsed)) {
      const t = (o.toolsUsed as unknown[]).filter(
        (s): s is string => typeof s === "string",
      );
      if (t.length > 0) norm.toolsUsed = t;
    }
    out.push(norm);
  }
  return out;
}

export type ChatSnapshot = {
  title: string;
  messages: NormalizedMessage[];
  unread: number;
  sessionId?: string | null;
};

// 클라가 응답을 받기 전에 떠났을 때(clientGone) 서버가 대신 응답을 대화에 써넣고
// 폰으로 푸시한다. 대화 저장소는 전체-행 upsert(LWW) 라, 클라가 보낸 스냅샷
// (직전까지의 메시지 = 유저 메시지 포함)에 어시스턴트 메시지를 append 해 통째로
// 올린다. updatedAt 을 지금 시각으로 둬, 클라의 직전 push(전송 시각)보다 최신이 되어
// LWW 가 서버 응답을 채택 → 폰이 다시 열리면 동기화로 답변이 내려온다.
export async function persistAndNotify(
  conversationId: string,
  snapshot: ChatSnapshot,
  reply: { text: string; toolsUsed?: string[]; sessionId?: string },
): Promise<void> {
  const text = reply.text?.trim();
  if (!conversationId || !text) return;

  const assistant: NormalizedMessage = {
    id: `a${Date.now()}`,
    role: "assistant",
    text: reply.text,
    createdAt: new Date().toISOString(),
    ...(reply.toolsUsed && reply.toolsUsed.length > 0
      ? { toolsUsed: reply.toolsUsed }
      : {}),
  };
  // 스냅샷은 parseChatRequest 단계에서 normalize 를 거쳐 들어오지만, 직접 호출 경로
  // (테스트/내부)에서 잡 데이터가 새지 않게 여기서 한 번 더 거른다.
  const prior = normalizeSnapshotMessages(snapshot.messages);

  // ★ LWW 시계차 방어: 폰 로컬의 대화 updatedAt 은 마지막(유저) 메시지의 createdAt(=폰
  // 시계)으로 찍혀 있다. 폰 시계가 서버보다 앞서 있으면 서버 완료시각(Date.now())이 그보다
  // 작아, 동기화 머지(updatedAt 비교)가 서버 응답을 "더 낡음"으로 버린다 → 답이 영영 안 뜸.
  // 그래서 스냅샷 메시지들의 최대 createdAt(폰 시계 기준)보다 확실히 뒤로 찍는다.
  const priorMaxMs = prior.reduce<number>((mx, m) => {
    const t = Date.parse(m.createdAt);
    return Number.isFinite(t) && t > mx ? t : mx;
  }, 0);
  const updatedAt = new Date(Math.max(Date.now(), priorMaxMs + 1000)).toISOString();

  try {
    await upsertConversationRemote(conversationId, {
      title: snapshot.title || "나비스와의 대화",
      kind: "chat",
      messages: [...prior, assistant],
      // 이번 턴이 끝난 뒤 이어갈 SDK 세션 id(없으면 클라가 보낸 직전 id). 동기화로
      // 내려가 다음 턴이 백그라운드 완주 지점부터 멀티턴으로 이어진다.
      sessionId: reply.sessionId || snapshot.sessionId || null,
      unread: (snapshot.unread ?? 0) + 1, // 안 보고 있던 방 → 안 읽음 +1
      hidden: false,
      updatedAt,
    });
    // 방금 영속한 답이 폰의 다음 pull(GET 캐시)에 즉시 반영되게 캐시 무효화.
    invalidateConversationsCache();
  } catch (err) {
    console.error("[chat] 백그라운드 응답 영속 실패(무시):", err);
  }

  // 폰 푸시(NTFY) — 설정(NTFY_TOPIC) 없으면 조용히 no-op. fire-and-forget.
  publishToNtfy(snapshot.title || "나비스", text.replace(/\s+/g, " ").slice(0, 140));
}
