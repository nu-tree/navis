// 프로젝트 필터 조건 — recent · recall 이 같은 규칙을 쓴다.

import { eq, isNull, or, type SQL } from "drizzle-orm";
import { memories } from "@navis/db";

/**
 * 이 회원의 기억만(specs/002). 모든 기억 질의의 조건 배열 **맨 앞**에 둔다 — 빠뜨리면 남의 기억이
 * 섞이므로, 조건을 쓰는 자리마다 첫 줄로 고정해 눈에 띄게 한다.
 */
export const ownedBy = (userId: string): SQL => eq(memories.userId, userId);

type ScopeInput = { project?: string; exactProject?: boolean; personalOnly?: boolean };

/**
 * - personalOnly: 개인 기억(프로젝트 없음)만
 * - project + exactProject: 그 프로젝트만 — 기억 화면에서 정리할 때
 * - project: 그 프로젝트 + 개인 기억(FR-018) — 대화에서 맥락을 좁힐 때. 개인 기억을 빼면
 *   프로젝트 맥락에서 사용자 자신에 관한 것을 못 본다.
 */
export const projectScope = (input: ScopeInput): SQL | undefined => {
  if (input.personalOnly) return isNull(memories.project);
  if (!input.project) return undefined;
  if (input.exactProject) return eq(memories.project, input.project);
  return or(eq(memories.project, input.project), isNull(memories.project));
};
