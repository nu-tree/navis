import type { IncomingMessage, ServerResponse } from "node:http";
import {
  requireAppAuth,
  sendJson,
  readJsonBody,
  sendUpstreamError,
} from "./respond.js";
import {
  listConversationsRemote,
  upsertConversationRemote,
  deleteConversationRemote,
} from "../conversations/api.js";

// 대화 목록 조회는 기기마다 30초 주기 + 복귀 시 자주 호출되는데, 매번 namory 를 친다.
// 채팅 생성(SDK CLI stdio 파싱)이 단일 이벤트 루프를 점유하는 동안엔 이 가벼운 조회의
// namory 응답조차 10초 안에 픽업 못 해 AbortSignal.timeout 오탐이 나고, 그 탓에 폰의
// pull 이 실패해 백그라운드 완주 답이 안 내려온다. 짧은 TTL 캐시 + 단일비행 +
// stale-while-revalidate 로, 잦은 pull 을 TTL 당 1회 왕복으로 합치고 경합 중에도 직전
// 값을 즉시 돌려줘 타임아웃 자체를 없앤다. 쓰기(PUT/DELETE) 시 무효화해 정합성 유지.
const LIST_TTL_MS = 3000;
let listCache: { at: number; value: unknown[] } | undefined;
let listInflight: Promise<unknown[]> | undefined;
// 무효화 세대 토큰 — 쓰기(invalidate) 직전 시작된 refresh 가 쓰기 이전 데이터로 캐시를
// 다시 채우는 걸 막는다(PUT 직후 GET 시 자기 쓰기 누락 방지).
let listEpoch = 0;

function refreshList(): Promise<unknown[]> {
  const epoch = listEpoch;
  const p = listConversationsRemote();
  listInflight = p;
  p.then(
    (v) => {
      if (epoch === listEpoch) listCache = { at: Date.now(), value: v };
    },
    () => {},
  ).finally(() => {
    if (listInflight === p) listInflight = undefined;
  });
  return p;
}

async function getConversationsCached(): Promise<unknown[]> {
  if (listCache && Date.now() - listCache.at < LIST_TTL_MS) return listCache.value;
  const p = listInflight ?? refreshList();
  if (listCache) return listCache.value; // stale 즉시 반환(갱신은 백그라운드)
  return p; // 최초(캐시 없음)만 대기 — 실패 시 호출부로 전파
}

export function invalidateConversationsCache(): void {
  listCache = undefined;
  listEpoch++; // 진행 중 refresh 의 결과를 무효화(stale 재채움 방지)
  listInflight = undefined; // 다음 조회가 쓰기 이후 데이터를 새로 가져오게
}
const invalidateList = invalidateConversationsCache;

// 앱 대화 동기화 프록시 — namory /conversations 로 위임. APP_API_TOKEN 인증.
export async function handleGetConversations(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    sendJson(res, 200, { conversations: await getConversationsCached() });
  } catch (err) {
    sendUpstreamError(res, "[conversations] 조회 실패:", err);
  }
}

export async function handlePutConversation(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    const body = await readJsonBody(req, res);
    if (!body) return;
    await upsertConversationRemote(id, body);
    invalidateList(); // 내 쓰기가 다음 조회에 즉시 반영되게
    sendJson(res, 200, { ok: true, id });
  } catch (err) {
    sendUpstreamError(res, "[conversations] 저장 실패:", err);
  }
}

export async function handleDeleteConversation(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    await deleteConversationRemote(id);
    invalidateList();
    sendJson(res, 200, { ok: true, id });
  } catch (err) {
    sendUpstreamError(res, "[conversations] 삭제 실패:", err);
  }
}
