import { createServer } from "node:http";
import { config } from "./config.js";
import { route } from "./http/router.js";

// 로컬 개발용 HTTP 서버. 배포 대상은 Vercel(Next.js Route Handlers)이며, 그쪽은
// 같은 http/* 핸들러를 재사용한다 — 이 파일은 `node dist/index.js` 로 로컬에서
// 전체 API 를 띄워보는 용도다.
//
// 스케줄러는 여기서 시작하지 않는다. 예전에는 부팅 시 node-cron 스케줄러 3개를
// 등록했지만(사용자 크론·다이제스트·캘린더), 서버리스에는 타이머를 들고 있을 프로세스가
// 없어 그 모델을 버렸다. 이제 외부 트리거가 POST /api/scheduler/tick 을 주기적으로
// 치고, scheduler/tick.ts 가 발동 대상을 계산해 DB 클레임으로 중복 없이 실행한다.
function main(): void {
  createServer((req, res) => route(req, res)).listen(config.port, "0.0.0.0", () => {
    console.log(
      `[agent] http on :${config.port} (/health, /api/chat, /api/reports, /api/crons, /api/memories, /api/scheduler/tick)`,
    );
  });
}

main();
