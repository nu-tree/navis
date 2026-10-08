"use client";

import { useMutation } from "@tanstack/react-query";
import type { CancelRequest } from "@navis/validation";
import { fetchPost } from "@/utils/fetch-client";

/**
 * 진행 중인 턴 중지. 연결만 끊으면 서버는 계속 생성한다 — 반드시 이걸 불러야 멈춘다.
 *
 * 실패해도 알리지 않는다. 그 사이 턴이 끝났으면 서버엔 멈출 것이 없고, 그 경우가 대부분이다.
 */
export const useCancelChat = () => {
  return useMutation({
    mutationFn: async (turnId: string) => {
      await fetchPost("/api/chat/cancel", { turnId } satisfies CancelRequest);
    },
  });
};
