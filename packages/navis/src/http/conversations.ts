import { json, readJsonBody, withAppAuth } from "./respond.js";
import {
  listConversationsRemote,
  upsertConversationRemote,
  deleteConversationRemote,
} from "../conversations/api.js";

// 앱 대화 동기화 — 전체 pull(GET) / 방 upsert(PUT) / 툼스톤 삭제(DELETE).
//
// 예전엔 여기에 3초 TTL 캐시 + 단일비행 + stale-while-revalidate + 무효화 세대 토큰이
// 있었다(약 40줄). 이유는 이랬다: 채팅 생성이 단일 이벤트 루프를 점유하는 동안 이
// 가벼운 조회의 namory HTTP 응답조차 10초 안에 픽업 못 해 AbortSignal.timeout 오탐이
// 났고, 그 탓에 폰의 pull 이 실패했다.
//
// 그 원인이 둘 다 사라졌다: 요청마다 인스턴스가 따로라 채팅 생성이 조회의 이벤트
// 루프를 굶기지 않고, namory 가 라이브러리가 되어 이 조회에는 HTTP 타임아웃이라는
// 개념 자체가 없다(그냥 DB 쿼리). 게다가 모듈 레벨 캐시는 인스턴스마다 따로라
// 서버리스에서 적중률이 사실상 0 이다 — 남겨두면 이득 없이 정합성 위험만 진다.

export function handleGetConversations(req: Request): Promise<Response> {
  return withAppAuth(req, "[conversations] 조회 실패:", async () =>
    json(200, { conversations: await listConversationsRemote() }),
  );
}

export function handlePutConversation(req: Request, id: string): Promise<Response> {
  return withAppAuth(req, "[conversations] 저장 실패:", async () => {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    await upsertConversationRemote(id, parsed.body);
    return json(200, { ok: true, id });
  });
}

export function handleDeleteConversation(req: Request, id: string): Promise<Response> {
  return withAppAuth(req, "[conversations] 삭제 실패:", async () => {
    await deleteConversationRemote(id);
    return json(200, { ok: true, id });
  });
}
