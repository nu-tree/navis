export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 헬스체크. DB 를 건드리지 않는다 — 배포가 살아있는지만 본다.
export function GET(): Response {
  return Response.json({ ok: true });
}
