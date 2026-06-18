// ── 디스패처 ────────────────────────────────────────────────────────────
// HTTP 요청 1건을 라우트 테이블과 대조해 적절한 핸들러로 보낸다.
// createServer 콜백에서 호출되는 진입점.

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendInternalError } from "../respond.js";
import { routes } from "./routes.js";

// HTTP 요청 1건을 적절한 핸들러로 라우팅한다. createServer 콜백에서 호출.
export function route(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";
  for (const r of routes) {
    if (r.method !== "*" && r.method !== method) continue;
    const m = r.match(url.pathname);
    if (!m.ok) continue;
    // 최후 방어선: 핸들러가 동기 throw 하거나 반환한 Promise 가 reject 돼도
    // 연결이 응답 없이 매달리지 않도록 500 으로 닫는다. 개별 핸들러의 자체 catch 가
    // 우선이고, 여기는 거기서 빠져나간 예외만 잡는다(이미 헤더가 나갔으면 본문은 생략).
    try {
      const result = r.handler(req, res, url, { id: m.id });
      if (result instanceof Promise) {
        result.catch((err) => sendInternalError(res, "[router] handler rejected:", err));
      }
    } catch (err) {
      sendInternalError(res, "[router] handler threw:", err);
    }
    return;
  }
  res.writeHead(404);
  res.end();
}
