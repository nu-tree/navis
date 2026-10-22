"use client";

import { useQuery } from "@tanstack/react-query";
import type { OAuthClientInfo } from "@navis/validation";
import { fetchGet } from "@/utils/fetch-client";

/** 동의 화면에 보일 앱 — 이름 · 돌아갈 주소. 모르는 앱이면 서버가 준 문구로 실패한다. */
export const useOAuthClient = (clientId: string) =>
  useQuery({
    queryKey: ["oauth", "client", clientId],
    queryFn: async () => {
      const res = await fetchGet<OAuthClientInfo>(`/api/oauth/clients/${encodeURIComponent(clientId)}`);
      if (!res.ok) {
        const detail = (() => {
          try {
            return (JSON.parse(res.error.message) as { error?: string }).error;
          } catch {
            return undefined;
          }
        })();
        throw new Error(detail ?? "연결을 요청한 앱을 확인하지 못했어요.");
      }
      return res.data;
    },
    retry: false,
  });
