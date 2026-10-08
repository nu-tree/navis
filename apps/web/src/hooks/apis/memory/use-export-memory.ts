"use client";

import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/common/use-toast";

/** 기억 전체 내보내기 — JSON 파일 하나로 내려받는다(FR-050, FR-051) */
export const useExportMemory = () => {
  const toast = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/memories/export");
      if (!res.ok) {
        console.error(`[use-export-memory] ${res.status} ${await res.text().catch(() => "")}`);
        throw new Error("내보내지 못했습니다.");
      }
      const blob = await res.blob();
      // 파일 이름은 여기서 정한다 — BFF 는 응답을 그대로 흘리고 헤더를 덧붙이지 않는다.
      const name = `navis-memories-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      return name;
    },
    onSuccess: (name) => toast.success(`${name} 으로 내보냈습니다.`),
    onError: (error) => toast.error(error.message),
  });
};
