import { config } from "./config.js";

// 사용 중인 프로젝트 이름 목록을 namory(REST /projects)에서 받아, 저장 시 모델이
// 새 철자를 지어내지 않고 기존 표준 이름을 재사용하도록 시스템 프롬프트에 주입한다.
// (나비스↔navis, 구미공모전↔gumi-contest 같은 표기 분기의 근본 해결 — 하드코딩 별칭
//  없이 데이터에서 목록이 자동 갱신된다.) 잦은 호출을 피해 5분 캐시.

const BASE = config.namoryMcpUrl.replace(/\/mcp\/?$/, "");
const auth = { Authorization: `Bearer ${config.namoryToken}` };
const TTL_MS = 5 * 60 * 1000;

let cache: { at: number; names: string[] } | undefined;

async function fetchProjectNames(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.names;
  try {
    const res = await fetch(`${BASE}/projects`, { headers: auth, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`projects 조회 실패: ${res.status}`);
    const data = (await res.json()) as { projects?: { project: string }[] };
    const names = (data.projects ?? [])
      .map((p) => p.project)
      .filter((x): x is string => !!x);
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
