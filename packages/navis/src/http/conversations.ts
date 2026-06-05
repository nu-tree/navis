import type { IncomingMessage, ServerResponse } from "node:http";
import { requireAppAuth, sendJson, readBody, safeParse } from "./respond.js";
import {
  listConversationsRemote,
  upsertConversationRemote,
  deleteConversationRemote,
} from "../conversations/api.js";

// 앱 대화 동기화 프록시 — namory /conversations 로 위임. APP_API_TOKEN 인증.
export async function handleGetConversations(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    sendJson(res, 200, { conversations: await listConversationsRemote() });
  } catch (err) {
    console.error("[conversations] 조회 실패:", err);
    sendJson(res, 502, { error: "upstream error" });
  }
}

export async function handlePutConversation(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    const body = safeParse(await readBody(req)) ?? {};
    await upsertConversationRemote(id, body);
    sendJson(res, 200, { ok: true, id });
  } catch (err) {
    console.error("[conversations] 저장 실패:", err);
    sendJson(res, 502, { error: "upstream error" });
  }
}

export async function handleDeleteConversation(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  if (!requireAppAuth(req, res)) return;
  try {
    await deleteConversationRemote(id);
    sendJson(res, 200, { ok: true, id });
  } catch (err) {
    console.error("[conversations] 삭제 실패:", err);
    sendJson(res, 502, { error: "upstream error" });
  }
}
