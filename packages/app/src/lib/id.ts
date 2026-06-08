// 전역 고유 id — 기기·세션·앱 재시작 간 절대 겹치지 않도록 생성한다.
// 시각(ms, base36) + 랜덤(base36)을 조합해 대화방·메시지 id 로 쓴다.
//
// ⚠️ 이전 구현은 세션마다 0 부터 시작하는 단순 카운터(`c1`, `c2`, …)였다. 앱을
// 켤 때마다 리셋돼서 폰·맥·맥미니가 각각 똑같은 `c1`/`c2` 를 만들어냈고, 서버
// 동기화에서 서로 다른 대화가 같은 id 로 충돌·덮어써졌다(동기화가 깨진 근본 원인).
// 이제 기기 간에도 유일하므로 한 곳에서 만든 방이 다른 기기 방을 지우지 않는다.
export function makeId(prefix = 'm'): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${t}${r}`;
}
