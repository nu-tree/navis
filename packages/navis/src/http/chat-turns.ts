import { upsertConversationRemote } from "../conversations/api.js";
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

export type ChatSnapshot = {
  title: string;
  messages: unknown[];
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

  const assistant = {
    id: `a${Date.now()}`,
    role: "assistant",
    text: reply.text,
    createdAt: new Date().toISOString(),
    ...(reply.toolsUsed && reply.toolsUsed.length > 0
      ? { toolsUsed: reply.toolsUsed }
      : {}),
  };
  const prior = Array.isArray(snapshot.messages) ? snapshot.messages : [];

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
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[chat] 백그라운드 응답 영속 실패(무시):", err);
  }

  // 폰 푸시(NTFY) — 설정(NTFY_TOPIC) 없으면 조용히 no-op. fire-and-forget.
  publishToNtfy(snapshot.title || "나비스", text.replace(/\s+/g, " ").slice(0, 140));
}
