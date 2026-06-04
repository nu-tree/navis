import { makeId } from '../lib/id';
import { NAVIS_URL, NAVIS_TOKEN, IS_BACKEND_CONFIGURED } from '../lib/config';
import type { ChatMessage } from '../types';

export type SendResult = {
  reply: ChatMessage;
  sessionId: string;
  // navis 컨텍스트가 한도를 넘음 → 다음 턴부터 세션 리셋 신호
  contextFull: boolean;
  // 이 턴에 namory 에 기억을 저장했는지 → 💡 리액션 표시
  saved: boolean;
};

type ChatResponse = {
  text: string;
  sessionId: string;
  contextFull: boolean;
  saved: boolean;
};

function assistantMessage(text: string): ChatMessage {
  return {
    id: makeId('a'),
    role: 'assistant',
    text,
    createdAt: new Date().toISOString(),
  };
}

// navis 백엔드(/api/chat)로 메시지 전송. sessionId 가 있으면 그 대화를 이어간다.
// 백엔드 미설정(.env 없음)이면 목업 응답으로 폴백.
export async function sendMessage(text: string, sessionId?: string): Promise<SendResult> {
  if (!IS_BACKEND_CONFIGURED) {
    return mockReply(text);
  }

  const res = await fetch(`${NAVIS_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${NAVIS_TOKEN}`,
    },
    body: JSON.stringify({ text, sessionId }),
  });

  if (!res.ok) {
    throw new Error(`navis 응답 오류: ${res.status}`);
  }

  const data = (await res.json()) as ChatResponse;
  return {
    reply: assistantMessage(data.text),
    sessionId: data.sessionId,
    contextFull: data.contextFull,
    saved: data.saved,
  };
}

async function mockReply(text: string): Promise<SendResult> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return {
    reply: assistantMessage(
      `(목업) "${text}" 잘 받았어. 백엔드(EXPO_PUBLIC_NAVIS_URL) 설정하면 진짜 나비스가 답할게.`,
    ),
    sessionId: '',
    contextFull: false,
    saved: false,
  };
}
