// 임박 알림 중복 방지용 in-memory 상태.
// 이미 알림 보낸 이벤트 id 를 Set 으로 들고, 24h TTL 로 오래된 항목을 정리한다.
// 컨테이너 재시작 시 손실되는 건 의도된 단순함.

// 이미 알림 보낸 이벤트 id. recurring 인스턴스도 고유 id 라 그대로 OK.
const notifiedEvents = new Set<string>();

// 알림은 너무 빨리/늦게 보내지 않게 24h 가 지나면 잊는다 (재발 일정 대비 너무 길지 않게).
const NOTIFIED_TTL_MS = 24 * 60 * 60 * 1000;
const notifiedAt = new Map<string, number>();

// 해당 이벤트 id 가 이미 알림 처리됐는지 확인.
export function isNotified(id: string): boolean {
  return notifiedEvents.has(id);
}

// 알림 처리됨으로 mark 하고, 동시에 만료된 오래된 항목을 정리한다.
export function markNotified(id: string): void {
  notifiedEvents.add(id);
  notifiedAt.set(id, Date.now());
  // 오래된 항목 정리
  const cutoff = Date.now() - NOTIFIED_TTL_MS;
  for (const [k, t] of notifiedAt) {
    if (t < cutoff) {
      notifiedAt.delete(k);
      notifiedEvents.delete(k);
    }
  }
}
