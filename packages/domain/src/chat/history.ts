// 끊긴 에이전트 세션을 대신할 때 쓰는 대화 기록 복원 — 순수 함수라 따로 둔다.
// 왜 필요한지는 ./index.ts 의 liveSessions 주석.

import type { Message } from "@navis/validation";

/** 세션이 끊겼을 때 새 세션에 넘길 이전 대화. 최근 것부터 이 한도 안에서 자른다. */
const HISTORY_MAX_MESSAGES = 20;
const HISTORY_MAX_CHARS = 8_000;

export type HistoryMessage = Pick<Message, "role" | "text">;

/**
 * 끊긴 세션 대신 새 세션을 열 때, 이전 대화를 프롬프트 앞에 붙인다.
 *
 * 전체를 다시 넣지 않는다 — 긴 방이면 첫 토큰이 늦어진다. 최근 몇 개면 "방금 무슨
 * 얘기였는지"는 이어지고, 그 이전의 사실은 기억(recall)이 맡는다.
 */
export const withHistory = (prompt: string, history: readonly HistoryMessage[]): string => {
  const recent = history.filter((m) => m.text.trim()).slice(-HISTORY_MAX_MESSAGES);
  const lines = recent.map((m) => `${m.role === "user" ? "사용자" : "나비스"}: ${m.text}`);
  // 한도를 넘으면 그보다 오래된 줄은 전부 버린다. 뒤에서부터 채워야 최근 맥락이 남고,
  // 한 번 넘친 뒤에 짧은 옛 줄을 끼워 넣으면 대화가 중간이 빠진 채 이어진다.
  const kept = lines.reduceRight<{ out: string[]; size: number; full: boolean }>(
    (acc, line) =>
      acc.full || acc.size + line.length > HISTORY_MAX_CHARS
        ? { ...acc, full: true }
        : { out: [line, ...acc.out], size: acc.size + line.length, full: false },
    { out: [], size: 0, full: false },
  ).out;
  if (kept.length === 0) return prompt;
  return [
    "[이전 대화 — 서버가 다시 시작돼 기록에서 복원했다. 이어서 답한다.]",
    ...kept,
    "",
    "[이번 메시지]",
    prompt,
  ].join("\n");
};
