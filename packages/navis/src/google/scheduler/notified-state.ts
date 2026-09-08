// 임박 알림 중복 방지 상태 — settings KV 에 보관.
//
// 예전엔 in-memory Set 이었고 "컨테이너 재시작 시 손실되는 건 의도된 단순함"이라고
// 적혀 있었다. 서버리스에서는 그 손실이 상시다: 매 틱이 새 인스턴스일 수 있어 Set 이
// 항상 비어 있고, 그러면 같은 일정에 대해 30분마다 알림이 다시 나간다. 중복 방지가
// 통째로 무력화되는 셈이라 영속화가 필수다.
//
// 형태: { eventId: 알림보낸시각(ms) } JSON 맵. 24h TTL 로 정리한다.
// 쓰기는 read-modify-write 지만, upcoming 잡은 틱 클레임으로 한 번에 하나만 도므로
// 사실상 단일 writer 다(최악의 경우도 알림 한 번 중복이라 락을 걸 값이 아니다).

import { getSetting, putSetting } from "../../settings-kv.js";

const KEY = "calendar-notified";
// 알림은 너무 빨리/늦게 보내지 않게 24h 가 지나면 잊는다 (재발 일정 대비 너무 길지 않게).
const NOTIFIED_TTL_MS = 24 * 60 * 60 * 1000;

type NotifiedMap = Record<string, number>;

// 틱 하나 안에서 isNotified 가 이벤트마다 불리므로, 매번 DB 를 때리지 않게 캐시한다.
// 인스턴스 수명(= 사실상 한 틱)만큼만 유효하면 충분하다.
let cache: NotifiedMap | undefined;

async function load(): Promise<NotifiedMap> {
  if (cache) return cache;
  const raw = await getSetting(KEY, {
    onError: (err) => console.error("[calendar] 알림 상태 조회 실패(무시):", err),
  });
  let map: NotifiedMap = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "number" && Number.isFinite(v)) map[k] = v;
        }
      }
    } catch {
      // 깨진 JSON → 빈 맵으로 시작. 다음 저장이 덮어쓴다.
      map = {};
    }
  }
  cache = map;
  return map;
}

// 해당 이벤트 id 가 이미 알림 처리됐는지 확인.
export async function isNotified(id: string): Promise<boolean> {
  const map = await load();
  const at = map[id];
  if (at === undefined) return false;
  // TTL 지난 항목은 "안 보낸 것"으로 취급(정리는 markNotified 가 한다).
  return Date.now() - at < NOTIFIED_TTL_MS;
}

// 알림 처리됨으로 mark 하고, 동시에 만료된 오래된 항목을 정리해 영속한다.
export async function markNotified(id: string): Promise<void> {
  const map = await load();
  map[id] = Date.now();
  const cutoff = Date.now() - NOTIFIED_TTL_MS;
  for (const [k, t] of Object.entries(map)) if (t < cutoff) delete map[k];
  try {
    await putSetting(KEY, JSON.stringify(map));
  } catch (err) {
    console.error("[calendar] 알림 상태 저장 실패(무시):", err);
  }
}
