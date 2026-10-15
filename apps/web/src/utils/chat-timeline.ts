// 대화 화면의 줄 세우기 — 날짜 구분선과 말풍선 묶음(2026-10-15 사용자 결정).
//
// 방이 하나뿐이라 메신저처럼 읽힌다: 하루가 바뀌면 날짜 줄을 긋고, 같은 사람이 같은 분(分) 안에
// 이어 보낸 말은 한 묶음으로 붙인다. 묶음의 첫 말풍선에만 이름 · 프로필, 마지막 말풍선에만 시각을 단다.
//
// 날짜 · 분은 한국 시각으로 자른다 — 약속 · 서버 시각(Asia/Seoul)과 같은 기준이어야 "어제 밤 11시 59분"이
// 기기 시간대에 따라 다른 날로 갈리지 않는다.

import type { Message } from "@navis/validation";

const TZ = "Asia/Seoul";

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const minuteKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, dateStyle: "full" });
const timeLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

/** 말풍선의 시각 표시(예: "오후 2:03"). 시각을 모르면(스트리밍 중) 빈 문자열. */
export const formatBubbleTime = (iso: string): string => (iso ? timeLabel.format(new Date(iso)) : "");

export type TimelineItem =
  | { kind: "date"; key: string; label: string }
  | {
      kind: "message";
      key: string;
      message: Message;
      /** 묶음의 첫 말풍선 — 이름 · 프로필을 단다. */
      first: boolean;
      /** 묶음의 마지막 말풍선 — 시각을 단다. */
      last: boolean;
    };

const sameGroup = (a: Message, b: Message) =>
  a.role === b.role && minuteKey.format(new Date(a.createdAt)) === minuteKey.format(new Date(b.createdAt));

/** 메시지(오래된 → 최근) → 날짜 줄 · 묶음 표시가 붙은 줄. 순수 함수. */
export function buildTimeline(messages: readonly Message[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  messages.forEach((message, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const day = dayKey.format(new Date(message.createdAt));
    if (!prev || dayKey.format(new Date(prev.createdAt)) !== day) {
      items.push({ kind: "date", key: `date-${day}`, label: dayLabel.format(new Date(message.createdAt)) });
    }
    items.push({
      kind: "message",
      key: message.id,
      message,
      first: !prev || !sameGroup(prev, message),
      last: !next || !sameGroup(message, next),
    });
  });
  return items;
}
