// ── 스케줄러 틱 ──────────────────────────────────────────────────────────────
// 예전에는 세 개의 node-cron 스케줄러가 상주 프로세스 안에서 각자 타이머를 들고 있었다
// (사용자 크론, 주간 다이제스트, 캘린더 upcoming/followup). 서버리스에는 타이머를 들고
// 있을 프로세스가 없다 — 응답을 보내면 인스턴스가 얼려지므로 setTimeout/node-cron 은
// 발화하지 않는다. 그래서 스케줄러는 "외부 트리거가 주기적으로 치는 엔드포인트"가 된다.
//
// 이 모듈이 그 엔드포인트의 본체다. 한 번 불리면:
//   1) 지금 발동해야 할 스케줄을 전부 계산한다(scheduler/due.ts)
//   2) 각각 DB 에서 원자적으로 실행권을 클레임한다(namory claimCronRun/claimSchedule)
//   3) 클레임에 성공한 것만 실행한다
//
// 왜 클레임이 필요한가: 틱은 겹친다. 트리거가 중복 발사할 수 있고, 앞선 틱이 아직 도는
// 중에 다음 틱이 들어올 수 있고, 인스턴스가 여러 개일 수 있다. 예전 코드가 in-memory
// `running` Set 으로 막던 중복을 이제 DB 조건부 UPDATE 가 막는다(인스턴스 경계를 넘어서).
//
// 실행시간 예산: 함수에는 상한이 있다(Vercel Hobby 300초). 밀린 잡이 많으면 한 틱에
// 다 못 돌 수 있으므로 예산을 두고 초과하면 남긴다 — 클레임하지 않은 잡은 다음 틱이
// 그대로 집어간다(클레임이 있으니 중복 없이 이어진다).

import { claimCronRun, claimSchedule, listCrons } from "namory";
import { config } from "../config.js";
import { askClaude } from "../claude/ask.js";
import { fullChatEnv } from "../claude/server-env.js";
import { emitReport } from "../reports/emit.js";
import { runDigest } from "../digest.js";
import { isCalendarEnabled } from "../google/auth.js";
import { runUpcomingCheck } from "../google/scheduler/upcoming.js";
import { runDailyFollowup } from "../google/scheduler/followup.js";
import {
  FOLLOWUP_CRON,
  TIMEZONE,
  UPCOMING_CHECK_CRON,
} from "../google/scheduler/constants.js";
import { dueFireTime } from "./due.js";

// 한 틱의 실행 예산. 함수 상한(Hobby 300s)보다 넉넉히 짧게 둬, 예산을 넘겨도 응답을
// 정상적으로 돌려주고 남은 잡은 다음 틱에 넘긴다(504 로 죽으면 진단이 어려워진다).
const BUDGET_MS = 4 * 60_000;

export type TickResult = {
  ran: string[]; // 실행한 스케줄 이름
  skipped: string[]; // 발동 대상이었지만 다른 틱이 이미 클레임한 것
  deferred: string[]; // 예산 초과로 다음 틱에 넘긴 것
  errors: { job: string; message: string }[];
};

export async function runSchedulerTick(now = new Date()): Promise<TickResult> {
  const result: TickResult = { ran: [], skipped: [], deferred: [], errors: [] };
  const deadline = now.getTime() + BUDGET_MS;
  const outOfBudget = () => Date.now() > deadline;

  // ── 1. 사용자 크론 ────────────────────────────────────────────────────────
  let rows: Awaited<ReturnType<typeof listCrons>> = [];
  try {
    rows = await listCrons({ enabledOnly: true });
  } catch (err) {
    result.errors.push({ job: "cron:list", message: msg(err) });
  }

  for (const c of rows) {
    const fire = dueFireTime(c.schedule, c.timezone, c.lastRunAt, now);
    if (!fire) continue;
    if (outOfBudget()) {
      result.deferred.push(`cron:${c.title}`);
      continue;
    }
    // 클레임 성공 = 이 발동을 내가 실행한다. 실패 = 다른 틱이 이미 가져갔다.
    let claimed;
    try {
      claimed = await claimCronRun(c.id, fire);
    } catch (err) {
      result.errors.push({ job: `cron:${c.title}`, message: msg(err) });
      continue;
    }
    if (!claimed) {
      result.skipped.push(`cron:${c.title}`);
      continue;
    }
    // 크론마다 자기 보고방 — sourceId=크론 id, 제목=크론 DB 제목.
    const meta = { sourceId: c.id, sourceTitle: `⏰ ${c.title}` };
    try {
      const { text } = await askClaude({ prompt: c.prompt, env: fullChatEnv });
      await emitReport(text, "cron", meta);
      result.ran.push(`cron:${c.title}`);
    } catch (err) {
      console.error(`[cron] '${c.title}' 실행 실패:`, err);
      result.errors.push({ job: `cron:${c.title}`, message: msg(err) });
      // 사용자가 실패를 인지할 수 있도록 보고방에도 알림.
      await emitReport(
        `⚠️ 크론 '${c.title}' 실행에 실패했어요. 배포 로그를 확인해주세요.`,
        "cron",
        meta,
      ).catch(() => undefined);
    }
  }

  // ── 2. 시스템 스케줄 (코드 상수 — DB 행이 없어 settings 로 클레임) ────────
  const systemJobs: { name: string; cron: string; tz: string; run: () => Promise<void> }[] = [
    {
      name: "digest",
      cron: config.digestSchedule,
      tz: config.digestTimezone,
      run: runDigest,
    },
  ];
  // 캘린더는 GOOGLE_* env 가 다 채워졌을 때만.
  if (isCalendarEnabled()) {
    systemJobs.push(
      {
        name: "calendar:upcoming",
        cron: UPCOMING_CHECK_CRON,
        tz: TIMEZONE,
        run: runUpcomingCheck,
      },
      {
        name: "calendar:followup",
        cron: FOLLOWUP_CRON,
        tz: TIMEZONE,
        run: runDailyFollowup,
      },
    );
  }

  for (const job of systemJobs) {
    // 시스템 스케줄의 lastRun 은 settings 안에 있어 여기서는 모른다 — 조건 비교를
    // claimSchedule 의 SQL 이 대신한다. 여기서는 "직전 발동시각"만 구해 넘긴다.
    const fire = dueFireTime(job.cron, job.tz, null, now);
    if (!fire) continue;
    if (outOfBudget()) {
      result.deferred.push(job.name);
      continue;
    }
    let won = false;
    try {
      won = await claimSchedule(`sched_${job.name.replace(/[^a-z0-9_]/gi, "_")}`, fire);
    } catch (err) {
      result.errors.push({ job: job.name, message: msg(err) });
      continue;
    }
    if (!won) {
      result.skipped.push(job.name);
      continue;
    }
    try {
      await job.run();
      result.ran.push(job.name);
    } catch (err) {
      console.error(`[scheduler] ${job.name} 실행 실패:`, err);
      result.errors.push({ job: job.name, message: msg(err) });
    }
  }

  return result;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
