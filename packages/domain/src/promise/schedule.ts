// 약속 일정 — 검증 · 다음 회차 · 사람이 읽는 표기(specs/003 R6). 순수 함수만 둔다(DB 없음).
//
// 자연어 → 일정 변환은 모델이 한다(도구 입력: 한 번은 오프셋이 있는 ISO 시각, 반복은 cron).
// 검증과 다음 회차 계산은 결정적이어야 하므로 여기서 한다. 반복은 항상 한국 시간으로 해석한다 —
// 사용자는 "매일 9시"를 한국의 9시로 말한다.

import { CronExpressionParser } from "cron-parser";
import { PROMISE_MIN_INTERVAL_MS, type PromiseScheduleInput } from "@navis/validation";
import { ScheduleInvalidError } from "../errors";

export const PROMISE_TZ = "Asia/Seoul";

export type Schedule = { kind: "once"; runAt: Date } | { kind: "cron"; cron: string };

/** 최소 간격 검사에 쓰는 회차 수. 하루 단위 반복의 불규칙(예: 9시와 9시 30분)까지 잡을 만큼. */
const INTERVAL_SAMPLES = 24;

const parseCron = (cron: string, currentDate: Date) =>
  CronExpressionParser.parse(cron, { tz: PROMISE_TZ, currentDate });

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const kstParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PROMISE_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    month: Number(get("month")),
    day: Number(get("day")),
    hour: get("hour"),
    minute: get("minute"),
    weekday: WEEKDAYS[weekday] ?? "",
  };
};

/** "10월 15일(수) 15:00" — 한국 시간. 모델이 확인 문장에 그대로 쓴다. */
export const formatKst = (d: Date): string => {
  const p = kstParts(d);
  return `${p.month}월 ${p.day}일(${p.weekday}) ${p.hour}:${p.minute}`;
};

/** 다음 회차들. 식을 읽을 수 없으면 ScheduleInvalidError. */
const sampleRuns = (cron: string, now: Date): Date[] => {
  try {
    return parseCron(cron, now)
      .take(INTERVAL_SAMPLES + 1)
      .map((d) => d.toDate());
  } catch {
    throw new ScheduleInvalidError(
      `반복 일정을 읽을 수 없어요: "${cron}". 분 시 일 월 요일 다섯 칸의 cron 식이어야 해요(예: "0 21 * * *" = 매일 21:00).`,
    );
  }
};

/**
 * 도구 입력을 검증해 일정으로 만든다. 잘못됐으면 ScheduleInvalidError — 이유가 곧 모델에게
 * 돌려줄 말이다(모델이 사용자에게 되묻게).
 */
export function validateSchedule(input: PromiseScheduleInput, now: Date): Schedule {
  if ("at" in input) {
    const runAt = new Date(input.at);
    if (Number.isNaN(runAt.getTime())) {
      throw new ScheduleInvalidError(`시각을 읽을 수 없어요: ${input.at}`);
    }
    if (runAt.getTime() <= now.getTime()) {
      throw new ScheduleInvalidError(
        `이미 지난 시각이에요(${formatKst(runAt)}). 지금은 ${formatKst(now)}예요 — 언제로 할지 다시 정해 주세요.`,
      );
    }
    return { kind: "once", runAt };
  }

  const cron = input.cron.trim();
  const samples = sampleRuns(cron, now);
  if (samples.length === 0) throw new ScheduleInvalidError(`다시 오지 않는 일정이에요: "${cron}"`);

  const tooClose = samples.some(
    (d, i) => i > 0 && d.getTime() - (samples[i - 1]?.getTime() ?? 0) < PROMISE_MIN_INTERVAL_MS,
  );
  if (tooClose) {
    const minute = kstParts(samples[0] ?? now).minute;
    throw new ScheduleInvalidError(
      `반복 간격은 최소 1시간이에요. 가장 가까운 일정은 매시 ${Number(minute)}분("${Number(minute)} * * * *")이에요.`,
    );
  }
  return { kind: "cron", cron };
}

/**
 * `after` 이후의 첫 회차. 놓친 회차는 건너뛴다 — 몰아서 실행하지 않는다(FR-016).
 * 한 번짜리 약속은 그 시각이 아직 오지 않았을 때만 회차가 있다.
 */
export function nextRunAfter(schedule: Schedule, after: Date): Date | null {
  if (schedule.kind === "once") {
    return schedule.runAt.getTime() > after.getTime() ? schedule.runAt : null;
  }
  try {
    return parseCron(schedule.cron, after).next().toDate();
  } catch {
    // 저장된 식은 만들 때 검증했다. 여기서 실패하면 다시 오지 않는 일정이다.
    return null;
  }
}

/** 다음 n 회차. 도구 응답에 실어 모델이 사람 말로 확인하게 한다(FR-004). */
export function upcoming(schedule: Schedule, now: Date, n: number): Date[] {
  if (schedule.kind === "once") return schedule.runAt.getTime() > now.getTime() ? [schedule.runAt] : [];
  try {
    return parseCron(schedule.cron, now)
      .take(n)
      .map((d) => d.toDate());
  } catch {
    return [];
  }
}

const pad = (v: string) => v.padStart(2, "0");
const isNum = (v: string | undefined): v is string => !!v && /^\d+$/.test(v);

/**
 * 사람이 읽는 일정. 흔한 모양(매일 · 매주 · 매시)은 말로, 그 밖은 cron 원문으로.
 * 정확한 회차는 upcoming() 이 보여 주므로 여기서 모든 식을 번역하려 하지 않는다.
 */
export function describeSchedule(schedule: Schedule): string {
  if (schedule.kind === "once") return `${formatKst(schedule.runAt)} 한 번`;

  const [min, hour, dom, mon, dow] = schedule.cron.split(/\s+/);
  if (isNum(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `매시 ${Number(min)}분`;
  }
  if (isNum(min) && isNum(hour) && dom === "*" && mon === "*") {
    const time = `${pad(hour)}:${pad(min)}`;
    if (dow === "*") return `매일 ${time}`;
    if (dow === "1-5") return `평일 ${time}`;
    if (isNum(dow)) return `매주 ${WEEKDAYS[Number(dow) % 7]}요일 ${time}`;
  }
  return `반복(${schedule.cron})`;
}
