// 최신순 목록을 날짜별로 묶는다 — 기억 화면의 "오늘 · 어제 · 11월 1일 (토)".
//
// 날짜는 한국 시각으로 자른다(chat-timeline.ts 와 같은 기준) — 기기 시간대에 따라 밤 11시 59분의
// 기억이 다른 날로 갈리지 않게.

const TZ = "Asia/Seoul";
const DAY_MS = 24 * 60 * 60 * 1000;

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const thisYearLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, month: "long", day: "numeric", weekday: "short" });
const otherYearLabel = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TZ,
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

/** 시각 → 한국 날짜 키 "YYYY-MM-DD". */
export const kstDayKey = (date: Date): string => dayKeyFormat.format(date);

/** 그날의 보이는 이름 — 오늘 · 어제, 올해면 "11월 1일 (토)", 아니면 연도까지. */
export const dayLabel = (date: Date, now = new Date()): string => {
  const key = kstDayKey(date);
  if (key === kstDayKey(now)) return "오늘";
  if (key === kstDayKey(new Date(now.getTime() - DAY_MS))) return "어제";
  const sameYear = key.slice(0, 4) === kstDayKey(now).slice(0, 4);
  return (sameYear ? thisYearLabel : otherYearLabel).format(date);
};

export type DayGroup<T> = { key: string; label: string; items: T[] };

/** 이미 최신순으로 정렬된 목록을 날짜별로 묶는다. 순서는 그대로 둔다. 순수 함수. */
export const groupByDay = <T>(items: readonly T[], createdAt: (item: T) => string, now = new Date()): DayGroup<T>[] =>
  items.reduce<DayGroup<T>[]>((groups, item) => {
    const date = new Date(createdAt(item));
    const key = kstDayKey(date);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(date, now), items: [item] });
    return groups;
  }, []);

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, weekday: "short" });

/** "14:20" — 한국 시각. */
export const timeLabel = (date: Date): string => timeFormat.format(date);

/** "오늘 14:20" · "어제 09:05" · "11월 1일 (토) 18:00". */
export const whenLabel = (date: Date, now = new Date()): string => `${dayLabel(date, now)} ${timeLabel(date)}`;

/** 한국 날짜 키 "YYYY-MM-DD" → 짧은 요일 "월". 키는 한국 날짜라 정오로 읽어 시간대에 흔들리지 않게 한다. */
export const weekdayOfKey = (key: string): string => weekdayFormat.format(new Date(`${key}T12:00:00+09:00`));
