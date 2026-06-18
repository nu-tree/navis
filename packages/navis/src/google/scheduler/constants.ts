// 캘린더 스케줄러 공통 상수.
// timezone(기본 Asia/Seoul), 임박 판정 윈도우, cron 식 등 동작에 직결되는 값들을 한곳에 모은다.

export const TIMEZONE = "Asia/Seoul";
export const UPCOMING_WINDOW_MIN = 90; // 다음 N분 안 시작이면 임박 판정
export const UPCOMING_CHECK_CRON = "*/30 * * * *"; // 매 30분
export const FOLLOWUP_CRON = "0 23 * * *"; // 매일 23시
