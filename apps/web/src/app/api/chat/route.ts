import { apiServer, missingApiConfig } from "@/lib/api-server";

// 채팅 BFF. 브라우저 → (여기) → apps/server /chat.
// 스트림은 파싱하지 않고 그대로 흘려보낸다 — 중간에서 파싱·재직렬화하면
// 첫 토큰이 늦어지고, 계약이 두 곳으로 갈라진다.
export async function POST(request: Request) {
  const missing = missingApiConfig();
  if (missing) return Response.json({ error: missing }, { status: 500 });

  const upstream = await fetch(`${apiServer.baseUrl}/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiServer.token}`,
      accept: "text/event-stream",
    },
    body: await request.text(),
    // 브라우저가 떠나면 업스트림 연결도 끊는다. 서버는 턴을 백그라운드로
    // 완주하므로, 진짜 중지는 /api/chat/cancel 이 한다.
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text().catch(() => upstream.statusText), {
      status: upstream.status,
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
