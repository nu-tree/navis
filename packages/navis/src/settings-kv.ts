// namory `/settings/:key` KV 의 GET/PUT 공통 헬퍼. system-prompt 와 connectors/store 가
// 각자 같은 namoryFetch('/settings/KEY') 패턴을 복붙해 쓰고 있었고, 응답 스키마({value?})
// 파싱도 양쪽이 동일하게 풀고 있었다. 한 곳으로 모아 둘이 갈라지지 않게 한다.
//
// 캐시 정책은 호출부 책임 — get/put 은 라운드트립만 추상화한다(시스템 프롬프트와 커넥터
// 목록은 TTL/무효화 시점이 다르므로 여기서 캐시를 잡으면 오히려 호출부 의도를 흐린다).
//
// 에러 처리도 호출부에 맡긴다: getSetting 은 미설정/실패를 undefined 로 반환(호출부가
// 기본값 처리), putSetting 은 실패 시 throw(호출부가 재시도/롤백 결정).
import { namoryFetch } from "./namory-client.js";

// 키 문자열 — 영문 소문자/숫자/언더스코어/하이픈만(설정 키로 안전한 문자).
// 안전한 키만 받음으로써 namoryFetch 경로에 임의 입력이 끼는 것을 막는다.
const KEY_RE = /^[a-z0-9_-]{1,64}$/i;
function assertKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error(`잘못된 설정 키: ${key}`);
}

// 값 조회. 미설정/HTTP 오류/네트워크 오류 모두 undefined 로 통일(호출부가 기본값 처리).
// 호출부의 콘솔 로깅 패턴은 보존하기 위해 에러를 삼키지 않고 옵션으로 받게 한다.
export async function getSetting(
  key: string,
  opts?: { onError?: (err: unknown) => void },
): Promise<string | undefined> {
  assertKey(key);
  try {
    const res = await namoryFetch(`/settings/${key}`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { value?: string | null };
    return data.value ?? undefined;
  } catch (err) {
    opts?.onError?.(err);
    return undefined;
  }
}

// 값 저장. 실패 시 throw — 호출부가 복구(재시도/캐시 보존) 결정.
export async function putSetting(key: string, value: string): Promise<void> {
  assertKey(key);
  const res = await namoryFetch(`/settings/${key}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`설정 저장 실패(${key}): HTTP ${res.status}`);
}
