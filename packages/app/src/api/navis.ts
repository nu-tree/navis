import { makeId } from '../lib/id';
import { NAVIS_URL, NAVIS_TOKEN, IS_BACKEND_CONFIGURED } from '../lib/config';
import type { Report } from '../store/chat-store';
import type { ChatMessage } from '../types';

// 첨부 이미지. uri=표시용 로컬 경로, base64/mimeType=백엔드 전송용.
export type Attachment = {
  uri: string;
  base64: string;
  mimeType: string;
};

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
// 첨부 이미지는 data URL(base64) 배열로 보낸다 → 백엔드가 Claude 비전에 전달.
// 백엔드 미설정(.env 없음)이면 목업 응답으로 폴백.
export async function sendMessage(
  text: string,
  sessionId?: string,
  attachments?: Attachment[],
): Promise<SendResult> {
  if (!IS_BACKEND_CONFIGURED) {
    return mockReply(text);
  }

  const images = attachments?.map((a) => `data:${a.mimeType};base64,${a.base64}`);

  const res = await fetch(`${NAVIS_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${NAVIS_TOKEN}`,
    },
    body: JSON.stringify({ text, sessionId, images }),
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

// navis 선제 보고 폴링. 백엔드 미설정이면 빈 배열.
export async function fetchReports(): Promise<Report[]> {
  if (!IS_BACKEND_CONFIGURED) return [];
  const res = await fetch(`${NAVIS_URL}/api/reports`, {
    headers: { authorization: `Bearer ${NAVIS_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`navis 보고 조회 오류: ${res.status}`);
  }
  const data = (await res.json()) as { reports: Report[] };
  return data.reports;
}

export type Cron = {
  id: string;
  title: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
};

export type Memory = {
  id: string;
  content: string;
  category: string | null;
  project: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type MemoryPatch = {
  content?: string;
  category?: string;
  project?: string;
};

// 내 기억 전체 조회 (navis → namory 프록시)
export async function fetchMemories(): Promise<Memory[]> {
  if (!IS_BACKEND_CONFIGURED) return [];
  const res = await fetch(`${NAVIS_URL}/api/memories`, {
    headers: { authorization: `Bearer ${NAVIS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`기억 조회 오류: ${res.status}`);
  const data = (await res.json()) as { memories: Memory[] };
  return data.memories;
}

export async function patchMemory(id: string, patch: MemoryPatch): Promise<void> {
  const res = await fetch(`${NAVIS_URL}/api/memories/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${NAVIS_TOKEN}` },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`기억 수정 오류: ${res.status}`);
}

export async function deleteMemory(id: string): Promise<void> {
  const res = await fetch(`${NAVIS_URL}/api/memories/${id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${NAVIS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`기억 삭제 오류: ${res.status}`);
}

// 크론 목록 — 크론마다 보고방을 미리 만들기 위해.
export async function fetchCrons(): Promise<Cron[]> {
  if (!IS_BACKEND_CONFIGURED) return [];
  const res = await fetch(`${NAVIS_URL}/api/crons`, {
    headers: { authorization: `Bearer ${NAVIS_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`navis 크론 조회 오류: ${res.status}`);
  }
  const data = (await res.json()) as { crons: Cron[] };
  return data.crons;
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
