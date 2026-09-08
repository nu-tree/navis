import { handleSchedulerTick, preflight } from "navis/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 외부 트리거(.github/workflows/scheduler-tick.yml)가 5분마다 POST 한다.
// node-cron 을 대체하는 스케줄러 심장박동 — packages/navis/src/scheduler/tick.ts 참조.
export const OPTIONS = () => preflight();
export const POST = (req: Request) => handleSchedulerTick(req);
