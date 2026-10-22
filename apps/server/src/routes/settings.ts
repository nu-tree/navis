import { Hono, type Context } from "hono";
import type { AppEnv } from "../types";
import { chat, settings, usage } from "@navis/domain";
import { isClaudeTokenError } from "@navis/domain/errors";
import { claudeTokenInputSchema } from "@navis/validation";

// Claude 구독 토큰(US5). 인증은 app.ts 의 기본 잠금이 걸어뒀다.
//
// ★ 어떤 응답에도 토큰 원문이 없다(FR-037). PUT 도 받은 값을 되돌려주지 않고 상태만 준다.
//   로그에도 남기지 않는다 — 오류 로그에 요청 본문을 찍지 않는다.
export const settingsRoute = new Hono<AppEnv>()
  .get("/claude-token", async (c) => {
    try {
      return c.json(await settings.claudeToken.status(c.get("userId")));
    } catch (err) {
      return failure(c, err);
    }
  })
  .put("/claude-token", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = claudeTokenInputSchema.safeParse(body);
    // 검증 오류의 detail 에 받은 값이 실릴 수 있다 — 싣지 않는다.
    if (!parsed.success) return c.json({ error: "토큰이 비어 있습니다." }, 400);

    // 저장 전에 실제로 받아들여지는지 한 마디로 확인한다 — 예전엔 틀린 토큰도 대화를 해 봐야 알았다.
    // 거절되면 저장하지 않는다(422). 그 밖의 실패(네트워크 · 시간 초과)는 토큰 탓인지 모르니 저장은 한다.
    try {
      await chat.verifyClaudeToken(parsed.data.token.trim());
    } catch (err) {
      if (isClaudeTokenError(err) && err.kind === "claude_token_rejected") {
        return c.json({ error: err.message, code: err.kind }, 422);
      }
      console.error(`[settings] 토큰 확인 실패(저장은 진행): ${err instanceof Error ? err.name : "Error"}`);
    }

    try {
      return c.json(await settings.claudeToken.set(c.get("userId"), parsed.data.token));
    } catch (err) {
      return failure(c, err);
    }
  })
  // 요금제 한도 — 마지막으로 받은 값 그대로(usage/index.ts). 받은 적 없으면 null.
  .get("/usage", async (c) => {
    try {
      return c.json(await usage.getLimits(c.get("userId")));
    } catch (err) {
      return failure(c, err);
    }
  })
  .delete("/claude-token", async (c) => {
    try {
      return c.json(await settings.claudeToken.remove(c.get("userId")));
    } catch (err) {
      return failure(c, err);
    }
  });

function failure(c: Context, err: unknown) {
  // SecretError(키가 바뀌었거나 값이 깨졌다)는 사용자가 원인을 알 수 있게 그대로 알린다.
  const message =
    err instanceof settings.SecretError
      ? "저장된 토큰을 풀 수 없습니다. 서버 암호화 키(NAVIS_SETTINGS_KEY)가 바뀌었다면 토큰을 다시 등록해주세요."
      : "설정을 처리하지 못했습니다.";
  console.error(`[settings] ${err instanceof Error ? err.name : "Error"}`);
  return c.json({ error: message }, 500);
}
