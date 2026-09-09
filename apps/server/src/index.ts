import { serve } from "@hono/node-server";
import { app } from "./app";

// 상주 HTTP 서버. 서버리스가 아닌 이유:
//  - Agent SDK 가 서브프로세스를 띄우고 한 턴이 분 단위로 갈 수 있다
//    (Vercel Hobby 함수 상한 300초와 싸운다)
//  - 진행 중인 턴의 AbortController 를 프로세스 안에 들고 있을 수 있다
//    (중지 버튼이 DB 신호 없이 동작한다)
const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] http://localhost:${info.port}`);
});
