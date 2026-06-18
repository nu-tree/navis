// 자동 일정 처리 스케줄러 진입점.
//
// 잡 1) 다가오는 일정 알림 (매 30분) — runUpcomingCheck
// 잡 2) 지난 일정 follow-up (매일 23시) — runDailyFollowup
//
// 잡별 "실행 중" 플래그로, 직전 발동이 안 끝났는데 다음 틱이 들어오면 그 틱은 스킵한다.
// (LLM 평가가 한 틱을 넘기면 같은 이벤트가 두 번 평가돼 중복 알림/토큰 낭비가 날 수 있다.)

import cron from "node-cron";
import { isCalendarEnabled } from "../auth.js";
import { FOLLOWUP_CRON, TIMEZONE, UPCOMING_CHECK_CRON } from "./constants.js";
import { runUpcomingCheck } from "./upcoming.js";
import { runDailyFollowup } from "./followup.js";

// 잡별 "실행 중" 플래그 — 직전 발동이 안 끝났는데 다음 틱이 들어오면 그 틱은 스킵.
let upcomingRunning = false;
let followupRunning = false;

// 캘린더가 활성화돼 있으면 두 cron 잡을 등록한다. 비활성이면 조용히 미시작.
export function startCalendarScheduler(): void {
  if (!isCalendarEnabled()) {
    console.log("[calendar] 비활성 (GOOGLE_* env 미설정) — 스케줄러 미시작");
    return;
  }
  // 알림은 앱(/api/reports)으로 간다.
  cron.schedule(
    UPCOMING_CHECK_CRON,
    () => {
      if (upcomingRunning) {
        console.log("[calendar] upcoming 직전 실행이 아직 진행 중 — 이번 틱 스킵");
        return;
      }
      upcomingRunning = true;
      void runUpcomingCheck().finally(() => {
        upcomingRunning = false;
      });
    },
    { timezone: TIMEZONE },
  );
  cron.schedule(
    FOLLOWUP_CRON,
    () => {
      if (followupRunning) {
        console.log("[calendar] follow-up 직전 실행이 아직 진행 중 — 이번 틱 스킵");
        return;
      }
      followupRunning = true;
      void runDailyFollowup().finally(() => {
        followupRunning = false;
      });
    },
    { timezone: TIMEZONE },
  );
  console.log(
    `[calendar] 스케줄러 시작 — upcoming '${UPCOMING_CHECK_CRON}', followup '${FOLLOWUP_CRON}' (${TIMEZONE})`,
  );
}
