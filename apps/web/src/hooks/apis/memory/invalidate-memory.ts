import type { QueryClient } from "@tanstack/react-query";

/**
 * 기억 하나가 바뀌면 그 기억이 보이는 모든 목록이 낡는다 — 목록 · 검색 · 할 일 · 이웃 · 프로젝트.
 * 각 prefix 를 좁게 나열한다(['memory'] 통째로 무효화하지 않는다 — 훅 규칙).
 */
export const invalidateMemoryViews = (queryClient: QueryClient) =>
  Promise.all(
    [
      ["memory", "list"],
      ["memory", "search"],
      ["memory", "todo"],
      ["memory", "neighbor"],
      ["memory", "project"],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
