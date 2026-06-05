// 프로젝트 이름 정규화 — 같은 프로젝트가 표기 차이로 갈라지는 걸 막는다.
// 배경: 앱(한국어 대화)에선 "나비스", 레포 CLI/Claude Code 에선 "navis"(폴더명)로
// 저장돼 같은 프로젝트가 두 그룹으로 쪼개졌다. 게다가 중복검사가 project 스코프라
// 표기가 다르면 같은 내용도 중복으로 안 걸려 따로 저장됐다. 저장·조회 양쪽에서
// 이 함수로 표준형으로 모은다.

// 별칭(왼쪽: 소문자 비교 키) → 표준 이름. 새 별칭이 생기면 여기만 추가.
const PROJECT_ALIASES: Record<string, string> = {
  나비스: "navis",
};

export function normalizeProject(
  project?: string | null,
): string | undefined {
  if (project == null) return undefined;
  const trimmed = project.trim();
  if (!trimmed) return undefined;
  return PROJECT_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}
