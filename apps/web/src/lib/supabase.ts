// Supabase 클라이언트 생성기.
//
// ★ 여기 쓰이는 두 값은 브라우저에 노출되는 것이 **설계상 맞다.**
//   - NEXT_PUBLIC_SUPABASE_URL: 공개 엔드포인트
//   - NEXT_PUBLIC_SUPABASE_ANON_KEY: 익명 키. 공개를 전제로 만들어진 값이고
//     데이터 접근 권한이 없다.
//
//   반면 NAVIS_API_TOKEN 은 절대 브라우저로 가지 않는다 — 그건 apps/server 를
//   부를 수 있는 자격이다. 둘은 다른 종류의 자격이다(헌장 보안 절).

import { createBrowserClient, createServerClient } from "@supabase/ssr";

type Env = { url: string; anonKey: string };

/**
 * 설정이 없으면 `null`. 로그인을 붙이기 전이나 설정을 빠뜨린 환경에서
 * 앱 전체가 죽지 않게 한다 — 대신 호출부가 그 상태를 명시적으로 다룬다.
 */
export const supabaseEnv = (): Env | null => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
};

/** 브라우저용. 로그인·로그아웃에만 쓴다 — 데이터는 /api/* (BFF)로만 오간다. */
export const browserClient = (env: Env) =>
  createBrowserClient(env.url, env.anonKey);

type CookieStore = {
  getAll: () => { name: string; value: string }[];
  set: (name: string, value: string, options: Record<string, unknown>) => void;
};

/**
 * 서버용. `getAll` 과 `setAll` 을 **둘 다** 구현해야 한다 — 라이브러리 문서가
 * 그러지 않으면 "random logouts, early session termination" 이 난다고 경고한다.
 *
 * 쿠키를 쓸 수 없는 문맥(서버 컴포넌트)에서는 set 이 던지므로 삼킨다. 그 경우
 * 토큰 갱신은 proxy 가 맡는다.
 */
export const serverClient = (env: Env, cookies: CookieStore) =>
  createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookies.set(name, value, options as Record<string, unknown>);
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. proxy 가 갱신을 처리한다.
        }
      },
    },
  });
