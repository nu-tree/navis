// 설정 KV(key→value) 의 get/put 래퍼. system-prompt 와 connectors/store 가 공유한다.
//
// namory 가 라이브러리가 된 뒤로는 DB 함수를 그대로 부르지만, 이 얇은 층은 남긴다:
// 키 검증과 "실패를 undefined 로 통일" 하는 에러 규약이 두 호출부의 계약이기 때문이다.
//
// 캐시 정책은 호출부 책임 — get/put 은 접근만 추상화한다(시스템 프롬프트와 커넥터
// 목록은 TTL/무효화 시점이 다르므로 여기서 캐시를 잡으면 오히려 호출부 의도를 흐린다).
//
// 에러 처리도 호출부에 맡긴다: getSetting 은 미설정/실패를 undefined 로 반환(호출부가
// 기본값 처리), putSetting 은 실패 시 throw(호출부가 재시도/롤백 결정).
import { getSetting as dbGetSetting, setSetting as dbSetSetting } from "namory";

// 키 문자열 — 영문 소문자/숫자/언더스코어/하이픈만(설정 키로 안전한 문자).
const KEY_RE = /^[a-z0-9_-]{1,64}$/i;
function assertKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error(`잘못된 설정 키: ${key}`);
}

// 값 조회. 미설정/조회 실패 모두 undefined 로 통일(호출부가 기본값 처리).
export async function getSetting(
  key: string,
  opts?: { onError?: (err: unknown) => void },
): Promise<string | undefined> {
  assertKey(key);
  try {
    return (await dbGetSetting(key)) ?? undefined;
  } catch (err) {
    opts?.onError?.(err);
    return undefined;
  }
}

// 값 저장. 실패 시 throw — 호출부가 복구(재시도/캐시 보존) 결정.
export async function putSetting(key: string, value: string): Promise<void> {
  assertKey(key);
  await dbSetSetting(key, value);
}
