// 사용 중인 프로젝트 이름 목록을 namory 에서 받아, 저장 시 모델이 새 철자를 지어내지
// 않고 기존 표준 이름을 재사용하도록 시스템 프롬프트에 주입한다.
// (나비스↔navis, 구미공모전↔gumi-contest 같은 표기 분기의 근본 해결 — 하드코딩 별칭
//  없이 데이터에서 목록이 자동 갱신된다.)
//
// 캐시는 남겨둔다. HTTP 왕복은 없어졌지만 이 함수는 매 턴 시스템 프롬프트를 합성하는
// 핫패스에서 불리고, 프로젝트 목록은 거의 안 바뀌는 집계 쿼리(GROUP BY)라 매 턴 DB 를
// 때릴 이유가 없다. 서버리스에서는 인스턴스 수명만큼만 유효하다(그래도 한 인스턴스가
// 연달아 처리하는 요청들에서 이득).
import { listProjects } from "namory";

const TTL_MS = 5 * 60 * 1000;

let cache: { at: number; names: string[] } | undefined;

async function fetchProjectNames(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.names;
  try {
    const rows = await listProjects();
    const names = rows.map((p) => p.project).filter((x): x is string => !!x);
    cache = { at: Date.now(), names };
    return names;
  } catch (err) {
    console.error("[projects] 조회 실패(무시):", err);
    return cache?.names ?? [];
  }
}

// 저장 가이던스 한 줄(프로젝트가 하나도 없으면 빈 문자열). 시스템 프롬프트에 덧붙인다.
export async function projectGuidance(): Promise<string> {
  const names = await fetchProjectNames();
  if (names.length === 0) return "";
  return (
    "\n\n[프로젝트 표기 통일] 현재 사용 중인 프로젝트: " +
    names.join(", ") +
    '. mcp__namory__save 호출 시 같은 프로젝트면 반드시 이 목록의 표기를 그대로 재사용하라(예: "나비스"·"Navis" 대신 "navis"). 목록에 없는 새 프로젝트일 때만 새 이름을 쓴다.'
  );
}
