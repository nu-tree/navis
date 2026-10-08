"use client";

import { toast, type ExternalToast } from "sonner";
import { useIsMobile } from "./use-mobile";

/** 토스트 위치·지속 시간을 한 곳에서 정한다. 모바일은 입력창을 가리지 않게 위에 띄운다. */
export const useToast = () => {
  const isMobile = useIsMobile();
  const base: ExternalToast = { position: isMobile ? "top-center" : "bottom-right" };

  const success = (message: React.ReactNode, data?: ExternalToast) =>
    toast.success(message, { ...base, duration: 3000, ...data });

  // 실패는 읽을 시간을 더 준다.
  const error = (message: React.ReactNode, data?: ExternalToast) =>
    toast.error(message, { ...base, duration: 5000, ...data });

  return { success, error };
};
