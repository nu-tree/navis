import type { IncomingMessage, ServerResponse } from "node:http";
import { requireAppAuth, sendJson, readBody, safeParse } from "./respond.js";
import { getSystemPrompt, setSystemPrompt } from "../system-prompt.js";

// 앱 설정 화면에서 시스템 프롬프트 조회/저장. 현재 유효한 값(DB→env→기본)을 돌려준다.
export async function handleGetSystemPrompt(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    sendJson(res, 200, { value: await getSystemPrompt() });
  } catch (err) {
    console.error("[settings] system-prompt 조회 실패:", err);
    sendJson(res, 502, { error: "upstream error" });
  }
}

export async function handlePutSystemPrompt(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    const body = safeParse(await readBody(req, res)) ?? {};
    const value = typeof body.value === "string" ? body.value : "";
    if (!value.trim()) return sendJson(res, 400, { error: "value required" });
    await setSystemPrompt(value);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error("[settings] system-prompt 저장 실패:", err);
    sendJson(res, 502, { error: "upstream error" });
  }
}
