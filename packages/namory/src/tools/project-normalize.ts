// 프로젝트 이름 정규화 — 표기 차이로 같은 프로젝트가 갈라지는 걸 줄인다.
// 여기선 "일반 규칙"만 둔다(하드코딩된 프로젝트별 별칭 없음): 공백 정리 + 빈값→undefined.
// 대소문자 차이(Navis/navis)는 조회/저장에서 lower() 비교로 흡수한다(filter.ts, save).
//
// ⚠️ 번역쌍(나비스 ↔ navis, 구미공모전 ↔ gumi-contest)처럼 글자 자체가 다른 경우는
// 문자열 규칙으로 못 합친다. 그 근본 해결은 "저장 시 모델에게 기존 프로젝트 목록을
// 보여줘 표준 이름을 재사용하게" 하는 것(navis 쪽 레지스트리 주입) — 별도 작업.
export function normalizeProject(project?: string | null): string | undefined {
  if (project == null) return undefined;
  const trimmed = project.trim();
  return trimmed || undefined;
}
