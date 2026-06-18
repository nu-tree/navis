// 잡 2: 지난 일정 follow-up (매일 23시).
//   - 오늘(KST) 끝난 일정을 따와 sub-agent 가 "follow-up todo" 가 있을지 판단
//   - 있으면 namory save 로 직접 저장 (장기 기억 + 할 일 큐)

import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../../config.js";
import { emitReport } from "../../reports/emit.js";
import { getCalendar } from "../auth.js";
import { reportCalendarError } from "./error-report.js";

// 오늘 끝난 일정을 모아 follow-up agent 에 넘기고, 요약이 있으면 보고로 발송.
export async function runDailyFollowup(): Promise<void> {
  try {
    const { cal } = getCalendar();
    const now = new Date();
    // 오늘 00:00 KST ~ 지금까지 끝난 일정만 follow-up 대상.
    // Railway 컨테이너는 UTC이므로 setHours(0,0,0,0) 은 UTC 자정 = KST 09:00 이 되어 틀림.
    // KST 날짜 문자열로 자정을 직접 구성한다.
    const kstDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // "YYYY-MM-DD"
    const startOfDay = new Date(`${kstDateStr}T00:00:00+09:00`);
    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: now.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });
    const events = res.data.items ?? [];
    if (events.length === 0) {
      console.log("[calendar] follow-up: 오늘 끝난 일정 없음");
      return;
    }
    const summary = await runFollowupAgent(events);
    if (summary) {
      emitReport(`**오늘 일정 follow-up**\n\n${summary}`, "calendar");
    }
  } catch (err) {
    reportCalendarError("일정 follow-up", err);
  }
}

const FOLLOWUP_SYSTEM_PROMPT = `너는 navis 의 일정 follow-up 서브에이전트다. 오늘 끝난 일정 목록을 받아 다음을 수행:

1) 각 일정마다 후속 작업이 필요할지 짧게 판단 (없으면 건너뛰기 — 무리하게 만들지 말 것).
2) 진짜 필요한 follow-up 만 mcp__namory__save 로 category="todo" 저장. content 는 자기완결적 한 줄 ("X 회의 후 결정사항 정리", "Y 일정 결과 슬랙에 공유" 식). 지시어("이거/그거") 금지.
3) 마지막에 사용자에게 보낼 짧은 한국어 요약 (3~5줄) 출력: 몇 건 저장했고 핵심이 뭔지. 저장한 게 없으면 "오늘 follow-up 없음" 으로 마무리.

규칙:
- source 는 항상 "navis-calendar-followup". project 는 비워둠.
- 도구 호출 결과의 duplicates 가 있으면 그 항목은 이미 namory 에 있다는 뜻 — 다시 안 만들고 다음으로 진행.
- markdown 헤더 금지(앱에 그대로 표시). 머리말 금지.`;

interface RawCalEvent {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  attendees?: { email?: string | null }[] | null;
}

// 일정 목록을 compact JSON 으로 정리해 sub-agent 에 넘기고, follow-up 요약 텍스트를 반환.
async function runFollowupAgent(events: RawCalEvent[]): Promise<string> {
  const compact = events.map((e) => ({
    summary: e.summary ?? "(제목 없음)",
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    location: e.location ?? null,
    description: e.description ?? null,
    attendees: e.attendees?.map((a) => a.email ?? "").filter(Boolean) ?? [],
  }));
  const prompt = [
    `[오늘 끝난 일정 ${events.length}건]`,
    "",
    "```json",
    JSON.stringify(compact, null, 2),
    "```",
  ].join("\n");
  let text = "";
  try {
    for await (const message of query({
      prompt,
      options: {
        model: config.model,
        systemPrompt: FOLLOWUP_SYSTEM_PROMPT,
        mcpServers: {
          namory: {
            type: "http",
            url: config.namoryMcpUrl,
            headers: { Authorization: `Bearer ${config.namoryToken}` },
            alwaysLoad: true,
          },
        },
        allowedTools: [
          "mcp__namory__save",
          "mcp__namory__recall",
          "mcp__namory__recent",
        ],
        settingSources: [],
        maxTurns: 12,
      },
    })) {
      if (message.type === "result" && message.subtype === "success") {
        text = message.result;
      }
    }
  } catch (err) {
    console.error("[calendar] follow-up agent 실패:", err);
    return "";
  }
  return text.trim();
}
