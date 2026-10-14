import { serve } from "@hono/node-server";
import { app } from "./app";
import { drain, stopAccepting } from "./promise-runner";

// 상주 HTTP 서버. 서버리스가 아닌 이유:
//  - Agent SDK 가 서브프로세스를 띄우고 한 턴이 분 단위로 갈 수 있다
//    (Vercel Hobby 함수 상한 300초와 싸운다)
//  - 진행 중인 턴의 AbortController 를 프로세스 안에 들고 있을 수 있다
//    (중지 버튼이 DB 신호 없이 동작한다)
const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] http://localhost:${info.port}`);
});

// 배포 · 축소 때 Cloud Run 이 보내는 종료 신호(유예 10초 뒤 SIGKILL). 새 약속은 더 집지 않고, 진행 중인
// 실행을 유예 안에서 기다린 뒤 끝낸다(specs/003 research R3). 못 끝낸 실행은 임대가 만료된 뒤 다음 tick 이
// 다시 집는다.
// ★ 리스너를 달면 Node 가 SIGTERM 으로 스스로 끝나지 않는다 — 직접 exit 한다.
const SHUTDOWN_GRACE_MS = 9_000;
process.on("SIGTERM", () => {
  console.log("[server] SIGTERM — 새 약속 선점을 멈추고 진행 중인 실행을 기다린다");
  stopAccepting();
  void Promise.race([drain(), new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS))]).then(() =>
    process.exit(0),
  );
});
