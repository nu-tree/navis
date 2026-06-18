// 캘린더 작업 실패를 "한눈에 에러임을 알 수 있게" 보고로 남기는 헬퍼.
// 알려진 인증 오류(invalid_grant 등)는 원인·조치까지 풀어서 적는다.

import { emitReport } from "../../reports/emit.js";

// 캘린더 작업 실패를 "한눈에 에러임을 알 수 있게" 보고로 남긴다(로그도 같이).
// 알려진 인증 오류(invalid_grant 등)는 원인·조치까지 풀어서 적는다.
export function reportCalendarError(
  job: "다가오는 일정 확인" | "일정 follow-up",
  err: unknown,
): void {
  const raw = err instanceof Error ? err.message : String(err);
  console.error(`[calendar] ${job} 실패:`, err);
  const isAuth = /invalid_grant|invalid_client|unauthorized|invalid_token|token/i.test(raw);
  const cause = isAuth
    ? "구글 인증 토큰 만료/취소(invalid_grant) — GOOGLE_REFRESH_TOKEN 재발급이 필요해요. (OAuth 동의화면이 '테스트' 모드면 7일마다 만료 → '게시'로 전환 권장)"
    : raw;
  emitReport(
    `⚠️ 캘린더 오류 — ${job} 실패\n\n원인: ${cause}`,
    "calendar",
  );
}
