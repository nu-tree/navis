// 브라우저 동의 진행 중인 pending 상태(state → Pending) 저장소와 TTL 청소.
// codeVerifier/clientSecret 같은 민감 자격이 만료 후에도 메모리에 잔존하지 않게 관리한다.

import type { Pending } from "./types.js";

export const pending = new Map<string, Pending>();
const PENDING_TTL_MS = 10 * 60_000;

// TTL 넘긴 pending 항목 제거.
export function sweep(): void {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.createdAt > PENDING_TTL_MS) pending.delete(k);
}

// startOAuth / completeOAuth 외에도, 둘 다 안 불리는 잔잔한 상태에서 TTL 넘긴 항목이
// codeVerifier/clientSecret 자격과 함께 메모리에 잔존하지 않도록 주기 타이머도 돌린다.
// 인터벌은 PENDING_TTL_MS 의 절반 — 최악의 경우 TTL+절반 만큼만 잔존.
const sweepTimer = setInterval(sweep, PENDING_TTL_MS / 2);
// 테스트/배포 셧다운에서 프로세스를 잡지 않게.
if (typeof sweepTimer.unref === "function") sweepTimer.unref();
