// 도구 응답 문자열 — 모델이 읽는 형태. 순수 함수라 DB · SDK 없이 테스트한다.

import type { Memory } from "@navis/validation";

const KST_MS = 9 * 60 * 60 * 1000;

/** ISO → KST "MM-DD HH:mm". 기간 조회 결과는 시각까지 있어야 하루 흐름이 읽힌다. */
const kstStamp = (iso: string): string =>
  new Date(Date.parse(iso) + KST_MS).toISOString().slice(5, 16).replace("T", " ");

/** 개인(프로젝트 없음) 기억의 묶음 이름. */
export const PERSONAL_GROUP = "(개인)";

/**
 * 프로젝트별로 묶는다. 묶음 순서는 기억이 많은 순, 개인은 맨 뒤.
 * 묶음 안은 **시간순(오래된 것 먼저)** — "오늘 한 일"은 흐름으로 읽는다.
 */
export const formatByProject = (items: readonly Memory[]): string => {
  const groups = new Map<string, Memory[]>();
  for (const m of items) {
    const key = m.project ?? PERSONAL_GROUP;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }

  const ordered = [...groups.entries()].sort(([a, x], [b, y]) => {
    if (a === PERSONAL_GROUP) return 1;
    if (b === PERSONAL_GROUP) return -1;
    return y.length - x.length || a.localeCompare(b);
  });

  return ordered
    .map(([name, list]) => {
      const lines = [...list]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((m) => {
          const tag = [m.category, m.done === true ? "완료" : null].filter(Boolean).join("/");
          return `- [${kstStamp(m.createdAt)}${tag ? ` ${tag}` : ""}] ${m.content}`;
        });
      return `## ${name} (${list.length}건)\n${lines.join("\n")}`;
    })
    .join("\n\n");
};
