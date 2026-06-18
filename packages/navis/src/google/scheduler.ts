// Google 캘린더 기반 스케줄 평가/실행 로직의 공개 진입점(barrel).
//
// 구현은 책임별로 ./scheduler/ 하위 모듈에 분리돼 있다:
//   - constants.ts      : timezone·cron·윈도우 상수
//   - notified-state.ts : 임박 알림 중복 방지 in-memory 상태
//   - error-report.ts   : 캘린더 오류 보고 헬퍼
//   - upcoming.ts       : 잡 1 — 다가오는 일정 알림
//   - followup.ts       : 잡 2 — 매일 일정 follow-up
//   - start.ts          : cron 잡 등록 진입점
//
// 외부 import 호환을 위해 동일한 공개 export 를 그대로 재export 한다.

export { startCalendarScheduler } from "./scheduler/start.js";
