import type { Client } from "discord.js";
import { recordReport } from "../reports/store.js";

const DISCORD_MAX = 2000;

// 디스코드 메시지 길이 제한(2000자)에 맞춰 자른다. 단어/줄 경계를 최대한 보존.
export function chunk(text: string): string[] {
  if (text.length <= DISCORD_MAX) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > DISCORD_MAX) {
    let cut = rest.lastIndexOf("\n", DISCORD_MAX);
    if (cut < DISCORD_MAX * 0.5) cut = DISCORD_MAX; // 줄바꿈이 너무 앞이면 그냥 끊음
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  return parts;
}

// 선제 보고의 출처(앱에서 방 라우팅에 사용). 크론은 크론마다 다르므로 호출부에서 넘긴다.
export type ReportMeta = { sourceId: string; sourceTitle: string };

// logTag 기본 출처 — 다이제스트/캘린더는 고정 방, 그 외는 logTag 기반.
function defaultMeta(logTag: string): ReportMeta {
  if (logTag === "digest") return { sourceId: "digest", sourceTitle: "📋 주간 다이제스트" };
  if (logTag === "calendar") return { sourceId: "calendar", sourceTitle: "📅 캘린더" };
  return { sourceId: logTag, sourceTitle: `🔔 ${logTag}` };
}

// 채널 id로 메시지를 전송. 길이 초과 시 chunk로 나눠 순차 전송.
// 채널을 못 찾거나 보낼 수 없으면 로그만 남기고 조용히 실패(스케줄러 흐름을 막지 않음).
// meta 를 주면 그 출처(방)로 보고를 기록한다. 없으면 logTag 기본 출처.
export async function sendToChannel(
  client: Client,
  channelId: string,
  text: string,
  logTag = "discord",
  meta?: ReportMeta,
): Promise<void> {
  // 선제 보고를 앱(/api/reports)용으로도 기록 — 디스코드 전송 성패와 무관하게.
  const source = meta ?? defaultMeta(logTag);
  recordReport({ type: logTag, text, sourceId: source.sourceId, sourceTitle: source.sourceTitle });

  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isSendable()) {
    console.error(`[${logTag}] 채널 전송 불가: ${channelId}`);
    return;
  }
  for (const part of chunk(text)) await ch.send(part);
}
