import { apiServer } from "@/lib/api-server";

// 약속 tick 중계. Cloud Scheduler → (여기) → apps/server /internal/tick (specs/003 R10).
//
// ★ 여기는 BFF 가 아니다. 로그인 세션을 보지 않고, web 이 쥔 NAVIS_API_TOKEN 도 붙이지 않는다.
//   Scheduler 가 보낸 Authorization(tick 토큰)을 **그대로** 넘기고 검증은 server 가 한다 — web 은
//   tick 토큰을 알 필요가 없다(/api/mcp 와 같은 방식, 헌장 보안 절).
// ★ 본문을 흘린다. server 는 약속 실행이 끝날 때까지 빈 줄을 흘리다 마지막에 결과를 쓴다 — 기다렸다가
//   한 번에 넘기면 그동안 이 요청이 조용해져 중간에서 끊긴다. 자체 운영(next start)이라 maxDuration 은
//   적용되지 않는다(배포 플랫폼 전용 설정).

export const POST = async (request: Request): Promise<Response> => {
  const authorization = request.headers.get("authorization");
  const upstream = await fetch(`${apiServer.baseUrl}/internal/tick`, {
    method: "POST",
    headers: authorization ? { authorization } : {},
    signal: request.signal,
  }).catch(() => null);

  if (!upstream) return Response.json({ error: "나비스 서버에 연결할 수 없다." }, { status: 502 });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
};
