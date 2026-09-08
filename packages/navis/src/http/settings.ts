import { json, readJsonBody, withAppAuth } from "./respond.js";
import { getSystemPrompt, setSystemPrompt } from "../system-prompt.js";

// 앱 설정 화면에서 시스템 프롬프트 조회/저장. 현재 유효한 값(DB→env→기본)을 돌려준다.
export function handleGetSystemPrompt(req: Request): Promise<Response> {
  return withAppAuth(req, "[settings] system-prompt 조회 실패:", async () =>
    json(200, { value: await getSystemPrompt() }),
  );
}

export function handlePutSystemPrompt(req: Request): Promise<Response> {
  return withAppAuth(req, "[settings] system-prompt 저장 실패:", async () => {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const value = typeof parsed.body.value === "string" ? parsed.body.value : "";
    if (!value.trim()) return json(400, { error: "value required" });
    await setSystemPrompt(value);
    return json(200, { ok: true });
  });
}
