// 테스트 전용 회원 — 실DB 테스트가 두 회원을 흉내 낸다(specs/002 T003).
// 운영 코드에서 import 하지 않는다.

/** 관리자 역할. 서버 테스트의 NAVIS_OWNER_ID stub 과 같은 값이다. */
export const USER_A = "00000000-0000-4000-8000-000000000001";
export const USER_B = "00000000-0000-4000-8000-000000000002";

export const TEST_USERS = [USER_A, USER_B] as const;
