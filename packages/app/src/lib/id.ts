// 단조 증가 카운터 — 객체 프로퍼티 변이로 구현 (가변 변수 미사용)
const counter = { value: 0 };

export function makeId(prefix = 'm'): string {
  counter.value += 1;
  return `${prefix}${counter.value}`;
}
