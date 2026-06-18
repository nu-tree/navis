import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendJson, withAppAuth } from "./respond.js";
import { getSystemPrompt, setSystemPrompt } from "../system-prompt.js";

// 앱 설정 화면에서 시스템 프롬프트 조회/저장. 현재 유효한 값(DB→env→기본)을 돌려준다.
export async function handleGetSystemPrompt(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await withAppAuth(req, res, "[settings] system-prompt 조회 실패:", async () => {
    sendJson(res, 200, { value: await getSystemPrompt() });
  });
}

export async function handlePutSystemPrompt(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await withAppAuth(req, res, "[settings] system-prompt 저장 실패:", async () => {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const value = typeof body.value === "string" ? body.value : "";
    if (!value.trim()) {
      sendJson(res, 400, { error: "value required" });
      return;
    }
    await setSystemPrompt(value);
    sendJson(res, 200, { ok: true });
  });
}
