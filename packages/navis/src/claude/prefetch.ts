import { buildEnabledConnectors, type BuiltConnectors } from "../connectors/mcp.js";
import { getSystemPrompt } from "../system-prompt.js";
import { projectGuidance } from "../projects.js";

// 채팅 핫패스 prefetch — 커넥터/시스템프롬프트/프로젝트가이드. 이 셋은 매 턴 namory 를
// 각각 호출한다(3 왕복). 동시 요청이 몰리면 이 namory 왕복이 단일 이벤트 루프를 더
// 압박해, namory 응답 처리가 밀려 10초 타임아웃 → 클라 재시도 → 부하 증폭(death-spiral)을
// 일으킨다. 짧은 TTL 메모이즈 + 단일비행 + stale-while-revalidate 로, 버스트 중엔
// namory 를 사실상 TTL 당 한 번만 치고 턴들은 캐시를 즉시 쓴다. 설정 변경은 TTL 내 반영.
export type ChatPrefetch = [BuiltConnectors, string, string];

// ⚠️ 향후 주의: buildEnabledConnectors 는 oauth 커넥터의 Bearer 토큰을 헤더에 구워
// 반환한다(connectors/mcp.ts). 그 결과를 TTL_MS 동안 캐싱하므로, 만료가 TTL 보다
// 짧은(또는 refresh 마진이 TTL 보다 작은) oauth 커넥터를 쓰면 stale 토큰이 나가
// 401 이 날 수 있다. 현재 활성 커넥터 0개라 무해. oauth 커넥터를 실제로 도입하면
// connectors 만 캐시에서 분리하거나 TTL 을 토큰 만료보다 짧게 둘 것.
const TTL_MS = 60_000;
let cached: { at: number; value: ChatPrefetch } | undefined;
let inflight: Promise<ChatPrefetch> | undefined;

function refresh(): Promise<ChatPrefetch> {
  const p: Promise<ChatPrefetch> = Promise.all([
    buildEnabledConnectors(),
    getSystemPrompt(),
    projectGuidance(),
  ]);
  inflight = p;
  // 백그라운드 갱신: 성공 시 캐시 갱신, 실패는 조용히(이전 캐시로 계속 동작 + 다음에 재시도).
  // 이 핸들러가 p 의 rejection 을 처리하므로 stale 반환 경로에서 unhandled rejection 이 안 난다.
  p.then(
    (value) => {
      cached = { at: Date.now(), value };
    },
    () => {},
  ).finally(() => {
    if (inflight === p) inflight = undefined;
  });
  return p;
}

// 캐시가 아예 없을 때 namory 가 죽어 있으면 첫 채팅이 영영 실패하는 걸 막기 위한
// 안전 폴백. 빈 커넥터·기본 시스템 프롬프트·빈 가이드로 채팅을 진행시킨다(MCP 의 동적
// 커넥터는 없지만 in-process 도구·namory MCP 는 그대로 동작 — askClaude 호출 시
// 메시지가 흐른다). 다음 TTL 만료 때 다시 시도.
const FALLBACK_PREFETCH: ChatPrefetch = [
  { servers: {}, allowedTools: [] },
  // 기본 시스템 프롬프트가 비어도 SDK 는 빈 문자열로 도는 데 문제가 없다. 사용자 캐릭터
  // 톤만 잠깐 빠질 뿐 채팅 자체는 작동.
  "",
  "",
];

// 캐시가 유효하면 즉시 반환. 만료/없음이면 갱신을 트리거하되, 이전(stale) 캐시가 있으면
// 그걸 즉시 반환하고 갱신은 백그라운드로 둔다 → 턴이 namory 지연에 묶이지 않는다.
// 캐시가 아예 없을 때(최초)는 갱신을 await 하되, 실패 시 호출부로 reject 를 전파하지
// 않고 안전한 빈 폴백을 돌려준다 → 핫패스(askClaude)가 namory 다운으로 전부 실패하지 않게.
export async function getChatPrefetch(): Promise<ChatPrefetch> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;
  const p = inflight ?? refresh();
  if (cached) return cached.value;
  try {
    return await p;
  } catch (err) {
    console.error("[prefetch] 최초 로드 실패 — 폴백 사용:", err);
    return FALLBACK_PREFETCH;
  }
}
