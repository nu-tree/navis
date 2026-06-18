// 로컬 에이전트 실행 경로 — 데스크톱 로컬 에이전트(내 맥 파일/터미널)로 실행하고
// 서버 navis 를 거치지 않는다. 메시지 전송 훅의 local 분기에서 호출된다.
import { localAgent } from "../../lib/local-agent";
import { useChatStore } from "../../store/chat-store";
import type { SendVars, StreamContext } from "./types";

// 로컬 에이전트 실행 결과 — mutation 의 반환 형태와 동일한 모양으로 맞춘다.
type LocalRunResult = {
  reply: { text: string; createdAt: string };
  sessionId: string | undefined;
  contextFull: boolean;
  saved: boolean;
};

// 로컬 모드 실행. localAgent 가 존재할 때만 호출된다(호출 측에서 보장).
// isCode: 코드 세션이면 SDK 세션 id 를 저장해 다음 턴에 이어간다(멀티턴).
export async function runLocalAgent(
  vars: SendVars,
  ctx: StreamContext,
  isCode: boolean,
): Promise<LocalRunResult> {
  const { text, conversationId, attachments, resume, workdir, namory } = vars;
  const { assistantId, ensureBubble, isStarted, setStatus } = ctx;
  const {
    addMessage,
    appendMessageText,
    appendMessageTool,
    appendMessageThinking,
    setMessageText,
  } = useChatStore.getState();

  const res = await localAgent!.run(text, {
    resume,
    workdir,
    namory: namory ?? undefined,
    // 첨부 이미지를 data URL 로 전달 — 없으면 텍스트만. 로컬 에이전트(SDK)가 비전
    // 입력으로 처리. uri 는 표시용(blob:/file:)이라 신뢰 불가 → 서버 경로(toDataUrls)와
    // 동일하게 mimeType+base64 로 구성한다.
    images: attachments?.map((a) => `data:${a.mimeType};base64,${a.base64}`),
    onDelta: (delta) => {
      ensureBubble();
      setStatus("__answering__");
      appendMessageText(conversationId, assistantId, delta);
    },
    // 도구 사용은 답변 본문과 분리해 접이식 '작업 과정' 블록(WorkDetails)에 쌓는다.
    // 인디케이터에도 같은 레이블을 띄워 지금 뭘 하는지 보이게 한다.
    onTool: (label) => {
      ensureBubble();
      setStatus(label);
      appendMessageTool(conversationId, assistantId, label);
    },
    // 생각 과정도 별도 블록으로 누적.
    onThinking: (delta) => {
      ensureBubble();
      setStatus("__thinking__");
      appendMessageThinking(conversationId, assistantId, delta);
    },
  });

  const replyText = res.error
    ? `⚠️ 로컬 에이전트: ${res.error}`
    : (res.text ?? "(빈 응답)");
  if (!isStarted()) {
    addMessage(conversationId, {
      id: assistantId,
      role: "assistant",
      text: replyText,
      createdAt: new Date().toISOString(),
    });
  } else {
    setMessageText(conversationId, assistantId, replyText);
  }
  // 코드 세션만 SDK 세션 id 를 저장해 다음 턴에 이어간다(멀티턴).
  // 일반 'chat' 의 localMode 는 서버 세션 네임스페이스와 섞이지 않게 저장 안 함.
  return {
    reply: { text: replyText, createdAt: new Date().toISOString() },
    sessionId: isCode ? res.sessionId : undefined,
    contextFull: false,
    saved: false,
  };
}
