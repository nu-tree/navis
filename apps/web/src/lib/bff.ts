// BFF 중계 — 브라우저와 apps/server 사이의 유일한 통로.
//
// ★ 브라우저는 이 층만 부른다. NAVIS_API_TOKEN 은 여기서 밖으로 나가지 않는다(FR-038).
//
// 세션 검증 자리는 지금 비어 있다. US6(로그인)에서 requireSession() 이 채운다 —
// 그때까지는 로컬 개발용으로 열려 있고, 그 상태를 아래 TODO 가 명시한다.

import { apiServer, missingApiConfig } from "@/lib/api-server";

/** 업스트림으로 그대로 넘기는 요청 헤더. 나머지는 버린다. */
const FORWARDED_REQUEST_HEADERS = ["content-type", "accept"] as const;

const jsonError = (message: string, status: number) =>
  Response.json({ error: message }, { status });

/**
 * TODO(US6): 세션을 검증한다. 없으면 **401 JSON** 을 돌려준다 — 리다이렉트하지 않는다.
 * `fetch` 호출자가 HTML 리다이렉트를 받으면 파싱이 깨진다(헌장 보안 절).
 * 화면 전환은 src/proxy.ts 의 낙관적 리다이렉트가 맡는다.
 */
const requireSession = async (): Promise<Response | null> => null;

type ProxyInit = {
  /** apps/server 의 경로. 예: `/memories`, `/chat` */
  path: string;
  /** 스트림을 그대로 흘릴지. `/chat` 만 true. */
  stream?: boolean;
};

/**
 * 브라우저 요청을 apps/server 로 중계한다.
 *
 * 스트림은 **파싱하지 않고 그대로 흘린다** — 중간에서 파싱·재직렬화하면 첫 토큰이
 * 늦어지고 계약이 두 곳으로 갈라진다(헌장 성능 절).
 */
export async function proxyToServer(
  request: Request,
  { path, stream = false }: ProxyInit,
): Promise<Response> {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const missing = missingApiConfig();
  if (missing) return jsonError(missing, 500);

  const headers = new Headers({ authorization: `Bearer ${apiServer.token}` });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (stream) headers.set("accept", "text/event-stream");

  // GET/HEAD 는 본문이 없다. 있다고 넘기면 fetch 가 던진다.
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  const upstream = await fetch(
    `${apiServer.baseUrl}${path}${new URL(request.url).search}`,
    {
      method: request.method,
      headers,
      ...(hasBody ? { body: await request.text() } : {}),
      // 브라우저가 떠나면 업스트림 연결도 끊는다. 서버는 턴을 백그라운드로 완주하므로
      // 진짜 중지는 /api/chat/cancel 이 한다.
      signal: request.signal,
    },
  ).catch(() => null);

  if (!upstream) {
    return jsonError("나비스 서버에 연결할 수 없다.", 502);
  }

  if (!upstream.ok || !upstream.body) {
    // 업스트림의 status 와 본문을 그대로 전달한다 — 404/409/502 가 여기서 뭉개지면
    // 화면이 실패 종류를 구분할 수 없다.
    const detail = await upstream.text().catch(() => upstream.statusText);
    return new Response(detail, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
      },
    });
  }

  if (!stream) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      // 프록시가 버퍼링하면 스트리밍이 아니라 한 방에 도착한다.
      "x-accel-buffering": "no",
    },
  });
}
