// 저장 레이아웃 ↔ 와이어 계약 매핑.
//
// 둘은 일부러 다르다. `tags`·`done`·`relatedIds` 는 DB 에선 `metadata` jsonb 안에 살고,
// 밖으로는 일급 필드로 나간다. 그 매핑이 이 모듈의 책임이다 — 저장 형태를 바꾸겠다고
// 기존 데이터를 마이그레이션할 이유가 없다(schema.ts 주석).
//
// 관계도 조인 테이블 대신 `metadata.relatedIds` 에 둔다 — 소비자가 하나뿐인 테이블을
// 미리 만들지 않는다(헌장 원칙 I).

import type { Category, Memory } from "@navis/validation";

/** DB 행의 metadata jsonb 안에 들어가는 것. */
export type MemoryMetadata = {
  tags?: string[];
  done?: boolean;
  relatedIds?: string[];
};

/** `memories` 테이블에서 읽어온 행의 모양(임베딩 제외 — 밖으로 내보내지 않는다). */
export type MemoryRow = {
  id: string;
  content: string;
  category: string | null;
  project: string | null;
  metadata: unknown;
  createdAt: Date;
};

const CATEGORIES: readonly string[] = [
  "decision",
  "learning",
  "idea",
  "feeling",
  "people",
  "todo",
];

/**
 * metadata jsonb 는 `unknown` 으로 들어온다 — 스키마가 강제하지 않는 자리다.
 * 손상된 값이 밖으로 새지 않게 여기서 좁힌다.
 */
export const parseMetadata = (raw: unknown): MemoryMetadata => {
  if (typeof raw !== "object" || raw === null) return {};
  const o = raw as Record<string, unknown>;

  const tags = Array.isArray(o.tags)
    ? o.tags.filter((t): t is string => typeof t === "string")
    : undefined;
  const relatedIds = Array.isArray(o.relatedIds)
    ? o.relatedIds.filter((t): t is string => typeof t === "string")
    : undefined;
  const done = typeof o.done === "boolean" ? o.done : undefined;

  return {
    ...(tags ? { tags } : {}),
    ...(done !== undefined ? { done } : {}),
    ...(relatedIds ? { relatedIds } : {}),
  };
};

/** 분류는 DB 에선 text 다. 값의 집합은 @navis/validation 이 단일 출처이므로 여기서 좁힌다. */
const parseCategory = (raw: string | null): Category | null =>
  raw !== null && CATEGORIES.includes(raw) ? (raw as Category) : null;

/**
 * DB 행 → 와이어 계약.
 *
 * `done` 은 할 일에만 의미가 있다. 할 일이 아니면 `null` 로 내보내 화면이 체크박스를
 * 그릴지 판단할 수 있게 한다 — `false` 로 내보내면 "미완료 할 일"과 구별되지 않는다.
 */
export const toMemory = (row: MemoryRow): Memory => {
  const meta = parseMetadata(row.metadata);
  const category = parseCategory(row.category);

  return {
    id: row.id,
    content: row.content,
    category,
    project: row.project,
    tags: meta.tags ?? [],
    done: category === "todo" ? (meta.done ?? false) : null,
    createdAt: row.createdAt.toISOString(),
  };
};

/** 와이어 입력 → metadata jsonb. 빈 값은 넣지 않아 jsonb 가 지저분해지지 않게 한다. */
export const toMetadata = (input: {
  tags?: string[];
  done?: boolean;
  relatedIds?: string[];
}): MemoryMetadata => ({
  ...(input.tags?.length ? { tags: input.tags } : {}),
  ...(input.done !== undefined ? { done: input.done } : {}),
  ...(input.relatedIds?.length ? { relatedIds: input.relatedIds } : {}),
});

/**
 * 기존 metadata 위에 부분 갱신을 얹는다.
 *
 * `update` 는 준 필드만 바꿔야 한다 — 통째로 덮으면 태그를 고칠 때 `done` 이 사라진다.
 */
export const mergeMetadata = (
  current: unknown,
  patch: { tags?: string[]; done?: boolean; relatedIds?: string[] },
): MemoryMetadata => {
  const base = parseMetadata(current);
  return {
    ...base,
    ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    ...(patch.done !== undefined ? { done: patch.done } : {}),
    ...(patch.relatedIds !== undefined ? { relatedIds: patch.relatedIds } : {}),
  };
};

/** 빈 문자열이면 개인·전역 기억으로 되돌린다(updateInputSchema 주석의 규약). */
export const normalizeProject = (raw: string | undefined): string | null | undefined =>
  raw === undefined ? undefined : raw.trim() === "" ? null : raw.trim();
