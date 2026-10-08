// 기간 경계 해석 — "오늘 한 일" 같은 날짜 기준 조회의 바탕이다.
//
// ★ 날짜만 주면 **한국 시간(KST)** 하루로 읽는다. 사용자가 한국에 있고, 서버(Cloud Run)는
//   UTC 로 돈다. `new Date("2026-10-07")` 는 UTC 자정이라 KST 오전 9시 이전 기억이 전날로 샌다.
//
// ★ until 은 **그날 끝까지** 포함한다. since=until=같은 날이면 그 하루 전체다 —
//   사람이 "7일부터 7일까지"라고 할 때의 뜻이다. 내부적으로는 다음 날 0시 미만(<)으로 바꾼다.

const KST_OFFSET = "+09:00";
const DAY_MS = 24 * 60 * 60 * 1000;

/** 지금 시각의 KST 날짜 (YYYY-MM-DD). */
export const kstDate = (now: Date = new Date()): string =>
  new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const addDays = (ymd: string, n: number): string =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const resolveDay = (raw: string, now: Date): string | null => {
  if (raw === "today") return kstDate(now);
  if (raw === "yesterday") return addDays(kstDate(now), -1);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

const parseInstant = (raw: string): Date => {
  // 오프셋 없는 시각도 KST 로 읽는다 — 서버 로컬(UTC)로 읽히면 9시간 어긋난다.
  const withZone = /(Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : `${raw}${KST_OFFSET}`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) throw new Error(`잘못된 시각: ${raw}`);
  return date;
};

/** since → 이 시각 이상(>=). */
export const parseSince = (raw: string, now: Date = new Date()): Date => {
  const day = resolveDay(raw, now);
  return day ? parseInstant(`${day}T00:00:00`) : parseInstant(raw);
};

/** until → 이 시각 미만(<). 날짜면 다음 날 0시다. */
export const parseUntil = (raw: string, now: Date = new Date()): Date => {
  const day = resolveDay(raw, now);
  return day ? parseInstant(`${addDays(day, 1)}T00:00:00`) : parseInstant(raw);
};
