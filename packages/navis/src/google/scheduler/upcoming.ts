// 잡 1: 다가오는 일정 알림.
//   - 다음 90분 안 시작 일정을 polling
//   - 새 일정마다 LLM sub-agent 가 namory 컨텍스트(recall) 와 함께 평가
//   - "빠뜨린 거 / 준비할 거 / 조언" 짧게 채널에 발송
//   - notified-state 로 중복 알림 방지

import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../../config.js";
import { emitReport } from "../../reports/emit.js";
import { getCalendar } from "../auth.js";
import { TIMEZONE, UPCOMING_WINDOW_MIN } from "./constants.js";
import { reportCalendarError } from "./error-report.js";
import { isNotified, markNotified } from "./notified-state.js";

// 다음 N분 안 시작 일정을 polling 해서 새 일정마다 알림을 보낸다.
export async function runUpcomingCheck(): Promise<void> {
  try {
    const { cal } = getCalendar();
    const now = new Date();
    const horizon = new Date(now.getTime() + UPCOMING_WINDOW_MIN * 60_000);
    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: horizon.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 20,
    });
    const events = res.data.items ?? [];
    for (const e of events) {
      if (!e.id || isNotified(e.id)) continue;
      // 종일 일정은 start.date 만 있고 시간 정보 없음 → 임박 알림 대상에서 제외.
      if (!e.start?.dateTime) continue;
      try {
        await notifyUpcoming(e);
      } catch (err) {
        console.error("[calendar] 일정 알림 발송 실패:", e.id, err);
      }
      markNotified(e.id); // 성공/실패 모두 mark — 실패해도 다음 cron에서 중복 알림 방지
    }
  } catch (err) {
    reportCalendarError("다가오는 일정 확인", err);
  }
}

// 일정 1건을 평가한 뒤 머리말·시작시간·링크를 붙여 보고로 발송.
async function notifyUpcoming(e: {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: { dateTime?: string | null } | null;
  end?: { dateTime?: string | null } | null;
  htmlLink?: string | null;
}): Promise<void> {
  const verdict = await evaluateUpcoming(e);
  const start = e.start?.dateTime
    ? new Date(e.start.dateTime).toLocaleString("ko-KR", { timeZone: TIMEZONE })
    : "(시간 미정)";
  const lines = [
    `**임박한 일정** — ${e.summary ?? "(제목 없음)"}`,
    `시작: ${start}${e.location ? ` · 장소: ${e.location}` : ""}`,
    "",
    verdict,
  ];
  if (e.htmlLink) lines.push("", e.htmlLink);
  emitReport(lines.join("\n"), "calendar");
}

// 다가오는 일정 1건에 대해 sub-agent 가 namory 컨텍스트 보고 짧게 평가.
const UPCOMING_SYSTEM_PROMPT = `너는 navis 의 일정 도우미 서브에이전트다. 곧 시작할 일정 정보를 받아 짧고 실용적인 조언을 한국어로 3~5줄로 준다.

작업:
1) namory recall 로 일정 제목/장소/참가자 관련 과거 기억을 1~2회 찾아본다(필요할 때만).
2) 다음 3가지를 골라 짧게: 빠뜨릴 만한 준비물·맥락, 시간/장소 주의, 한 줄 격려/조언.
3) 모르면 모른다고. 추측 금지. 5줄 넘기지 말 것.
4) markdown 헤더 금지(앱에 그대로 표시). 머리말("**임박한 일정**") 붙이지 말 것 — 호출자가 붙임.`;

// sub-agent 로 일정을 평가해 짧은 조언 텍스트를 반환. 실패해도 throw 하지 않고 안내 문구로 대체.
async function evaluateUpcoming(e: {
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: { dateTime?: string | null } | null;
  end?: { dateTime?: string | null } | null;
}): Promise<string> {
  const prompt = [
    "[다가오는 일정 정보]",
    `제목: ${e.summary ?? "(없음)"}`,
    `시작: ${e.start?.dateTime ?? "(미정)"}`,
    `종료: ${e.end?.dateTime ?? "(미정)"}`,
    e.location ? `장소: ${e.location}` : "",
    e.description ? `설명: ${e.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let text = "";
  try {
    for await (const message of query({
      prompt,
      options: {
        model: config.curatorModel,
        systemPrompt: UPCOMING_SYSTEM_PROMPT,
        mcpServers: {
          namory: {
            type: "http",
            url: config.namoryMcpUrl,
            headers: { Authorization: `Bearer ${config.namoryToken}` },
            alwaysLoad: true,
          },
        },
        // 읽기만 — recall/recent. 절대 save·update·delete 금지.
        allowedTools: ["mcp__namory__recall", "mcp__namory__recent"],
        settingSources: [],
        maxTurns: 4,
      },
    })) {
      if (message.type === "result" && message.subtype === "success") {
        text = message.result;
      }
    }
  } catch (err) {
    console.error("[calendar] upcoming 평가 실패:", err);
    return "(평가 생략)";
  }
  return text.trim() || "(평가 응답 없음)";
}
