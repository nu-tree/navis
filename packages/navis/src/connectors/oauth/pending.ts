// 브라우저 동의 진행 중인 pending 상태(state → Pending) 저장소.
//
// 예전엔 인메모리 Map + setInterval TTL 청소였다. 서버리스에서는 이게 단순한 성능
// 저하가 아니라 **기능 정지**다: /api/connectors/oauth/start 를 처리한 인스턴스와,
// 제공자가 사용자를 되돌려보내는 /oauth/callback 을 처리하는 인스턴스는 거의 항상
// 다르다. 콜백 쪽 Map 은 비어 있으니 "state 불일치/만료" 로 OAuth 가 100% 실패한다.
//
// 그래서 DB(settings KV)에 state 당 한 행으로 둔다. 담기는 값에 codeVerifier 와
// (기밀 클라이언트면) clientSecret 이 들어가는데, 커넥터의 access/refresh 토큰이 이미
// 같은 테이블에 있으므로 보안 등급이 달라지지 않는다. 대신 수명을 짧게(10분) 두고,
// 소비 시 DELETE ... RETURNING 으로 원자적으로 읽고 지운다 — 같은 state 를 두 번
// 소비하는 리플레이를 DB 가 막아준다.

import { setSetting, sweepSettingsByPrefix, takeSetting } from "namory";
import type { Pending } from "./types.js";

const PREFIX = "oauth_pending_";
const PENDING_TTL_MS = 10 * 60_000;

// state 는 b64url(randomBytes(24)) — [A-Za-z0-9_-] 만 나온다. 키에 그대로 붙여도
// 안전하지만, 외부에서 흘러온 값이 LIKE/키 공간을 오염시키지 않게 한 번 더 검증한다.
const STATE_RE = /^[A-Za-z0-9_-]{16,64}$/;

function keyFor(state: string): string | undefined {
  return STATE_RE.test(state) ? `${PREFIX}${state}` : undefined;
}

export async function putPending(state: string, p: Pending): Promise<void> {
  const key = keyFor(state);
  if (!key) throw new Error("잘못된 state 형식");
  await setSetting(key, JSON.stringify(p));
}

// state 로 pending 을 원자적으로 읽고 지운다. 없거나 TTL 초과면 undefined.
export async function takePending(state: string): Promise<Pending | undefined> {
  const key = keyFor(state);
  if (!key) return undefined;
  const raw = await takeSetting(key);
  if (!raw) return undefined;
  let p: Pending;
  try {
    p = JSON.parse(raw) as Pending;
  } catch {
    return undefined;
  }
  // 만료된 항목은 이미 지워졌으니 그대로 버린다.
  if (!p.createdAt || Date.now() - p.createdAt > PENDING_TTL_MS) return undefined;
  return p;
}

// TTL 넘긴 pending 항목 제거. 예전의 setInterval 대신 스케줄러 틱이 부른다 —
// codeVerifier/clientSecret 이 만료 후에도 DB 에 남아 있지 않게 한다.
export async function sweepPending(): Promise<number> {
  try {
    return await sweepSettingsByPrefix(PREFIX, new Date(Date.now() - PENDING_TTL_MS));
  } catch (err) {
    console.error("[connectors] pending 청소 실패(무시):", err);
    return 0;
  }
}
