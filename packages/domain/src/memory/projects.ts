// 프로젝트 스코프 — 목록 · 이름 바꾸기 · 합치기 · 비슷한 이름 감지.
//
// ★ 이름 바꾸기와 합치기는 **같은 연산**이다: `project = from` 인 기억을 전부 `to` 로 옮긴다.
//   to 가 이미 있으면 결과가 합치기일 뿐이다. 도구를 둘로 나누면 모델이 "합치기인데 rename 을
//   불렀다"며 망설일 자리만 생긴다. 결과의 merged 로 어느 쪽이었는지 알려준다.
//
// 'soopsns' 와 'soop-sns' 처럼 표기만 다른 스코프가 생기는 것이 이 모듈이 생긴 이유다
// (2026-10-07). 저장을 막지는 않는다 — 중복 판정을 하지 않는 save 와 같은 결정이다(FR-011).
// 대신 저장 결과에 경고를 실어 모델이 합치기를 제안하게 한다.

import { count, desc, eq, isNotNull, max } from "drizzle-orm";
import { db, memories } from "@navis/db";
import {
  projectKey,
  type ProjectSummary,
  type RenameProjectInput,
  type RenameProjectResult,
} from "@navis/validation";
import { NotFoundError } from "../errors";

/** 프로젝트별 기억 수 · 최근 저장 시각. 많은 순. */
export async function projects(): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      project: memories.project,
      count: count(),
      lastAt: max(memories.createdAt),
    })
    .from(memories)
    .where(isNotNull(memories.project))
    .groupBy(memories.project)
    .orderBy(desc(count()), memories.project);

  return rows.map((r) => ({
    project: r.project ?? "",
    count: Number(r.count),
    lastAt: (r.lastAt ?? new Date(0)).toISOString(),
  }));
}

export async function renameProject(
  input: RenameProjectInput,
): Promise<RenameProjectResult> {
  const from = input.from.trim();
  const to = input.to.trim();
  if (from === to) {
    throw new Error("바꿀 이름이 지금 이름과 같다.");
  }

  return db.transaction(async (tx) => {
    // 대상이 이미 있었는지는 옮기기 **전에** 본다 — 옮긴 뒤엔 언제나 있다.
    const [target] = await tx
      .select({ n: count() })
      .from(memories)
      .where(eq(memories.project, to));

    const moved = await tx
      .update(memories)
      .set({ project: to })
      .where(eq(memories.project, from))
      .returning({ id: memories.id });

    if (moved.length === 0) {
      // 오타로 없는 스코프를 옮기려 한 것이다. 조용히 0건 성공으로 두면 모델이 "합쳤다"고 답한다.
      throw new NotFoundError("project", from);
    }

    return { from, to, moved: moved.length, merged: Number(target?.n ?? 0) > 0 };
  });
}

/** name 과 키가 같지만 표기가 다른 기존 스코프들. */
export async function similarProjects(name: string): Promise<string[]> {
  const key = projectKey(name);
  if (!key) return [];
  const rows = await db
    .selectDistinct({ project: memories.project })
    .from(memories)
    .where(isNotNull(memories.project));
  return rows
    .map((r) => r.project)
    .filter((p): p is string => p !== null && p !== name && projectKey(p) === key);
}
