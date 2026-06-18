// 역할: 채팅 요청 바디 파싱 + 검증.
// chat / chat-stream 공통 입력(text, 첨부 이미지, resume, model, thinking,
// 백그라운드 완주용 conversationId/turnId/snapshot)을 안전하게 뽑아 ChatRequest 로
// 만든다. 이미지 개수/총량 상한, 모델 화이트리스트, 스냅샷 메시지 정규화를 여기서 끝낸다.
// 순수 추출 — 동작/시그니처는 chat.ts 원본과 동일.

import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";
import { collectImagesFromDataUrls } from "../claude/images.js";
import type { InputImage } from "../claude/types.js";
import { readJsonBody, sendJson } from "./respond.js";
import { normalizeSnapshotMessages, type ChatSnapshot } from "./chat-turns.js";

export type ChatRequest = {
  text: string;
  images: InputImage[];
  resume: string | undefined;
  // 사용자가 고른 모델(클로드 데스크톱식). 화이트리스트에 있을 때만 채워지고,
  // 아니면 undefined → askClaude 가 config.model 로 폴백한다.
  model: string | undefined;
  // 확장 사고(adaptive thinking) opt-in. body 에 명시적으로 true 일 때만 켠다.
  // 기본 off — adaptive 라도 첫 토큰을 2~4초 늦추므로 응답성 우선.
  thinking: boolean;
  // 백그라운드 완주/푸시용(스트림 전용). conversationId+conversation 스냅샷이 있으면
  // 클라가 응답 전에 떠나도 서버가 응답을 영속 + 폰 푸시한다. turnId 로 명시적 중지.
  conversationId: string | undefined;
  turnId: string | undefined;
  snapshot: ChatSnapshot | undefined;
};

// 한 요청당 이미지 상한 — 토큰/메모리 과부하·악의적 페이로드 방지. images.ts 에서 개별
// 이미지 크기를 다시 거르지만, 여기서 먼저 끊어 디코드 비용 자체를 막는다.
const MAX_IMAGES_PER_REQUEST = 8;
const MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;

// data URL 의 base64 페이로드만 보고 디코드 바이트 크기를 근사한다. 정확한 디코드 전에
// 합계를 가늠하기 위함(`= 패딩 2자 제외).
function approxDataUrlBytes(u: string): number {
  const i = u.indexOf(";base64,");
  if (i < 0) return u.length;
  const b64 = u.slice(i + ";base64,".length);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

// chat / chat-stream 공통 바디 파싱. text + 첨부 이미지(data URL) + resume(sessionId).
// 텍스트도 이미지도 없으면 400 을 쓰고 null 을 반환한다(이미지-only 는 허용).
export async function parseChatRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<ChatRequest | null> {
  const body = await readJsonBody(req, res);
  if (!body) return null;
  const text = typeof body.text === "string" ? body.text.trim() : "";

  const imageUrls = Array.isArray(body.images)
    ? (body.images.filter((u) => typeof u === "string") as string[])
    : [];
  // 개수/총량 상한 — 초과 시 디코드도 하지 않고 즉시 400.
  if (imageUrls.length > MAX_IMAGES_PER_REQUEST) {
    sendJson(res, 400, {
      error: `too many images (max ${MAX_IMAGES_PER_REQUEST})`,
    });
    return null;
  }
  let total = 0;
  for (const u of imageUrls) total += approxDataUrlBytes(u);
  if (total > MAX_TOTAL_IMAGE_BYTES) {
    sendJson(res, 400, {
      error: `total image bytes too large (max ${MAX_TOTAL_IMAGE_BYTES})`,
    });
    return null;
  }
  const images = imageUrls.length > 0 ? await collectImagesFromDataUrls(imageUrls) : [];

  if (!text && images.length === 0) {
    sendJson(res, 400, { error: "text or image required" });
    return null;
  }
  const resume =
    typeof body.sessionId === "string" && body.sessionId ? body.sessionId : undefined;
  // 모델은 화이트리스트(config.selectableModels) 검증 — 임의 문자열 주입 차단.
  const model =
    typeof body.model === "string" && config.selectableModels.includes(body.model)
      ? body.model
      : undefined;
  const thinking = body.thinking === true;

  const conversationId =
    typeof body.conversationId === "string" && body.conversationId
      ? body.conversationId
      : undefined;
  const turnId =
    typeof body.turnId === "string" && body.turnId ? body.turnId : undefined;
  const snap =
    body.conversation && typeof body.conversation === "object"
      ? (body.conversation as Record<string, unknown>)
      : undefined;
  // 스냅샷 메시지는 클라가 보낸 임의 구조라 그대로 namory upsert 로 흘러가면 안 된다.
  // {id,role,text,createdAt} 만 통과시키고 잡 원소를 제거(저장 전 단계에서 한번).
  const snapshot: ChatSnapshot | undefined = snap
    ? {
        title: typeof snap.title === "string" ? snap.title : "",
        messages: normalizeSnapshotMessages(snap.messages),
        unread: typeof snap.unread === "number" ? snap.unread : 0,
        sessionId: typeof snap.sessionId === "string" ? snap.sessionId : null,
      }
    : undefined;

  return { text, images, resume, model, thinking, conversationId, turnId, snapshot };
}
