"use client";

import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExportMemory } from "@/hooks/apis/memory/use-export-memory";

/** 기억 전체를 JSON 파일 하나로 내려받는다(FR-050). 0건이어도 빈 파일을 만든다(FR-051). */
export const MemoryExportButton = () => {
  const { mutate: exportMemory, isPending } = useExportMemory();

  return (
    <Button variant="outline" size="sm" disabled={isPending} onClick={() => exportMemory()}>
      {isPending ? <Loader2 className="animate-spin" /> : <Download />}
      내보내기
    </Button>
  );
};
