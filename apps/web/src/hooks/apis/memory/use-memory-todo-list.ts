"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Memory, TodosInput } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

export const getMemoryTodoListQueryOptions = (params: TodosInput) =>
  queryOptions({
    queryKey: ["memory", "todo", "list", params],
    queryFn: async () => {
      const res = await fetchGet<Memory[]>("/api/memories/todos", { params });
      if (!res.ok) throw new Error("할 일을 불러오지 못했습니다.");
      return res.data;
    },
  });

/** 할 일 목록 — 기본은 미완료만(FR-026) */
export const useMemoryTodoList = (params: TodosInput) => {
  return useQuery(getMemoryTodoListQueryOptions(params));
};
