// apps/server 를 부르는 서버 전용 설정.
//
// ★ NEXT_PUBLIC_ 접두사를 붙이지 않는다. 붙이는 순간 토큰이 브라우저 번들에
//   박혀 공개된 비밀이 된다 — 브라우저는 /api/* (BFF)만 부른다.
export const apiServer = {
  baseUrl: (process.env.NAVIS_API_URL ?? "http://localhost:4000").replace(
    /\/+$/,
    "",
  ),
  token: process.env.NAVIS_API_TOKEN ?? "",
};

export function missingApiConfig(): string | null {
  return apiServer.token
    ? null
    : "NAVIS_API_TOKEN 이 없다. apps/web/.env.local 을 채울 것 (.env.example 참고).";
}
