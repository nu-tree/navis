import type { IncomingMessage, ServerResponse } from "node:http";
import { runSchedulerTick } from "../scheduler/tick.js";
import { sendInternalError, sendJson, withAppAuth } from "./respond.js";

// 스케줄러 틱 — 외부 트리거(GitHub Actions cron 등)가 주기적으로 POST 한다.
// 상주 프로세스가 없어 node-cron 을 쓸 수 없으므로, 이 엔드포인트가 스케줄러의
// "심장 박동" 역할을 한다. 자세한 동작은 scheduler/tick.ts 주석 참조.
//
// 인증은 앱 API 와 같은 APP_API_TOKEN(withAppAuth) — 공개돼 있으면 아무나 크론을
// 강제 발동시켜 토큰을 태울 수 있다. 다만 클레임 덕분에 중복 호출 자체는 무해하다
// (예정시각이 지나지 않았으면 아무것도 실행되지 않는다).
//
// 응답은 이번 틱이 무엇을 했는지 그대로 돌려준다 — 트리거 로그(Actions 실행 기록)에
// 남아 "왜 안 돌았지"를 진단할 수 있게. 예산 초과로 남긴 잡은 deferred 에 들어간다.
export async function handleSchedulerTick(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await withAppAuth(
    req,
    res,
    "[scheduler] 틱 실패:",
    async () => {
      const result = await runSchedulerTick();
      const summary =
        `ran=${result.ran.length} skipped=${result.skipped.length} ` +
        `deferred=${result.deferred.length} errors=${result.errors.length}`;
      console.log(`[scheduler] 틱 완료 — ${summary}`);
      sendJson(res, 200, result);
    },
    sendInternalError,
  );
}
