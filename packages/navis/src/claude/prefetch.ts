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

// 캐시가 유효하면 즉시 반환. 만료/없음이면 갱신을 트리거하되, 이전(stale) 캐시가 있으면
// 그걸 즉시 반환하고 갱신은 백그라운드로 둔다 → 턴이 namory 지연에 묶이지 않는다.
// 캐시가 아예 없을 때(최초)만 갱신을 await 한다(이때 namory 실패는 호출부로 전파).
export async function getChatPrefetch(): Promise<ChatPrefetch> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;
  const p = inflight ?? refresh();
  if (cached) return cached.value;
  return p;
}
