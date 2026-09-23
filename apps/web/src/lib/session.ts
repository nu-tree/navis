// 세션 검증 — 인증을 아는 유일한 곳.
//
// ★ 이 파일 밖으로 인증이 새지 않는다. packages/* 와 apps/server 는 사용자 신원을
//   모른다(헌장 원칙 II). 기억·대화·설정에 사용자 식별자 열이 없는 이유다.

import { cookies } from "next/headers";
import { serverClient, supabaseEnv } from "@/lib/supabase";

export type SessionState =
  | { kind: "authenticated"; userId: string }
  | { kind: "anonymous" }
  /** Supabase 설정이 없다 — 로그인을 켜지 않은 로컬 개발 상태. */
  | { kind: "unconfigured" };

/**
 * 현재 요청의 세션.
 *
 * `getClaims()` 를 쓴다 — `getSession()` 은 쿠키의 값을 그대로 믿어서 위조된
 * 쿠키를 통과시킨다. 서명을 검증하는 쪽을 써야 한다.
 */
export async function getSession(): Promise<SessionState> {
  const env = supabaseEnv();
  if (!env) return { kind: "unconfigured" };

  const store = await cookies();
  const supabase = serverClient(env, {
    getAll: () => store.getAll(),
    set: (name, value, options) => store.set(name, value, options),
  });

  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string") return { kind: "anonymous" };

  return { kind: "authenticated", userId: sub };
}
