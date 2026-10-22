// 바깥에서 보이는 이 앱의 주소 — OAuth 메타데이터에 절대 URL 을 적어야 해서 필요하다.
//
// ★ request.url 을 쓰지 않는다. Cloud Run 에서 Next standalone 은 0.0.0.0:8080 으로 떠서 request.url 이
//   내부 주소를 가리킨다(auth/confirm/route.ts 참고). 프록시가 넘겨주는 Host · X-Forwarded-Proto 를 본다.
//   NAVIS_PUBLIC_URL 이 있으면 그것이 이긴다 — 도메인을 여러 개 붙였을 때 하나로 고정한다.

export function publicOrigin(request: Request): string {
  const fixed = process.env.NAVIS_PUBLIC_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;

  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** 외부 MCP 주소. Claude 에 붙여 넣는 값이다. */
export const mcpUrl = (origin: string) => `${origin}/api/mcp`;
