// namory REST(/projects, /settings, /crons, /memories, /conversations) 호출 공통 래퍼.
//
// 기존엔 7개 파일이 같은 BASE/auth/AbortSignal.timeout 보일러플레이트를 복붙하고
// 타임아웃이 5/10/25 초로 제각각이었다. 한 곳에서 베이스 URL 산출·인증 헤더·기본
// 타임아웃을 통일하고, 길게 가져가야 할 호출(cron·conversations)만 호출부에서
// 명시적으로 timeoutMs 를 넘기게 한다.
import { config } from "./config.js";

// namoryMcpUrl 이 ".../mcp" 형태로 들어오므로 끝 "/mcp" 를 떼어 REST 베이스로 쓴다.
export const NAMORY_BASE = config.namoryMcpUrl.replace(/\/mcp\/?$/, "");
export const NAMORY_AUTH: Readonly<Record<string, string>> = {
  Authorization: `Bearer ${config.namoryToken}`,
};

// 통일된 기본 타임아웃 — 일반 settings/memories/projects 호출용.
// 의도적으로 길어야 하는 호출(크론 모음 fetch 등)은 호출부에서 timeoutMs 로 넘긴다.
const DEFAULT_TIMEOUT_MS = 10_000;

// 모든 namory REST 호출의 단일 진입점. 경로(path)는 "/" 로 시작한다(예: "/projects").
// init.headers 가 있으면 Authorization 위에 머지(content-type 등은 호출부 명시).
// 호출부의 에러 처리(throw/log) 분기는 기존 동작을 그대로 보존하기 위해 이 래퍼에서는
// 강제하지 않는다 — 응답 객체를 그대로 반환한다.
//
// HeadersInit 은 세 가지 형태가 모두 합법이다: Record<string,string> | [string,string][] |
// Headers. 예전 구현은 항상 Record 로 단언했기에 Headers 인스턴스나 튜플 배열을 호출부가
// 넘기면 Object.keys 가 빈 결과를 돌려줘서 사용자 헤더가 조용히 사라졌다. 표준
// `new Headers()` 로 정규화한 뒤 NAMORY_AUTH 위에 덮어쓴다.
export async function namoryFetch(
  path: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const merged = new Headers(NAMORY_AUTH);
  if (init?.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((value, key) => {
      merged.set(key, value);
    });
  }
  return fetch(`${NAMORY_BASE}${path}`, {
    ...(init ?? {}),
    headers: merged,
    signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
}
