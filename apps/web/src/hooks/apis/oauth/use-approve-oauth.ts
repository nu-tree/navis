"use client";

import { useMutation } from "@tanstack/react-query";
import type { OAuthAuthorizeInput, OAuthAuthorizeResult } from "@navis/validation";
import { fetchPost } from "@/utils/fetch-client";

/**
 * 동의 화면의 "허용". 서버가 코드를 붙인 주소를 주면 그리로 옮긴다 — Claude 가 코드를 받아 연결을 마친다.
 * 다른 사이트로 가는 이동이라 router 가 아니라 location 으로 옮긴다.
 */
export const useApproveOAuth = () =>
  useMutation({
    mutationFn: async (input: OAuthAuthorizeInput) => {
      const res = await fetchPost<OAuthAuthorizeResult>("/api/oauth/authorize", input);
      if (!res.ok) {
        console.error(`[use-approve-oauth] ${res.error.status}`);
        throw new Error("연결을 허용하지 못했어요. 앱에서 연결을 처음부터 다시 시작해 주세요.");
      }
      return res.data.redirectTo;
    },
    onSuccess: (redirectTo) => window.location.assign(redirectTo),
  });
