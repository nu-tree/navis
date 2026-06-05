import { createServer } from "node:http";
import { config } from "./config.js";
import { startDiscord } from "./discord/bot.js";
import { startCronScheduler } from "./cron/scheduler.js";
import { startDigestScheduler } from "./digest.js";
import { startCalendarScheduler } from "./google/scheduler.js";
import { route } from "./http/router.js";

// 디스코드 게이트웨이 봇 시작 (always-on 워커). 토큰 없으면 undefined(앱 모드).
const client = startDiscord();

// 선제적 알림 스케줄러 시작 (namory에서 잡 로드 → node-cron 등록).
void startCronScheduler(client);

// 주간 기억 다이제스트 스케줄러 시작 (최근 기억 요약 → 프로필 자동 갱신 + 보고).
startDigestScheduler(client);

// 캘린더 스케줄러 시작 (다가오는 일정 알림 + 매일 23시 follow-up 정리).
// env 미설정이면 조용히 비활성.
startCalendarScheduler(client);

// Railway 등 호스팅 uptime 체크 + GitHub webhook 수신 + 앱 API. 라우팅은 http/router.
createServer((req, res) => route(req, res, client)).listen(config.port, "0.0.0.0", () => {
  console.log(
    `[agent] http on :${config.port} (/health, /webhook/github, /api/chat, /api/reports, /api/crons, /api/memories)`,
  );
});
