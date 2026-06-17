import { fetch as expoFetch } from 'expo/fetch';
import { makeId } from '../lib/id';
import { IS_BACKEND_CONFIGURED } from '../lib/config';
import { apiUrl, jsonHeaders } from './client';
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
  contextFull: boolean;
  saved: boolean;
  toolsUsed: string[];
  // 사용자가 중지 버튼으로 끊었는지 — 부분 응답을 그대로 유지하기 위함.
  aborted?: boolean;
  // 스트림이 done 없이 끊겼지만(폰 백그라운드/연결 끊김) 서버가 백그라운드로 완주 중 —
  // 에러가 아니다. 서버가 응답을 영속 + 폰 푸시하고, 앱은 다음 동기화에서 답을 받는다.
  incomplete?: boolean;
};

type ChatResponse = {
  text: string;
  sessionId: string;
  contextFull: boolean;
  saved: boolean;
  toolsUsed?: string[];
};

function assistantMessage(text: string): ChatMessage {
  return {
    id: makeId('a'),
    role: 'assistant',
    text,
    createdAt: new Date().toISOString(),
  };
}

// 스트림이 done 없이 끊겼지만 서버가 백그라운드로 완주 중인 경우의 결과(에러 아님).
const incompleteResult = (sessionId?: string): SendResult => ({
  reply: assistantMessage(''),
  sessionId: sessionId ?? '',
  contextFull: false,
  saved: false,
  toolsUsed: [],
  incomplete: true,
});

// 첨부 → data URL(base64) 배열. 백엔드가 Claude 비전에 전달.
const toDataUrls = (attachments?: Attachment[]): string[] | undefined =>
  attachments?.map((a) => `data:${a.mimeType};base64,${a.base64}`);

// navis 백엔드(/api/chat)로 메시지 전송. sessionId 가 있으면 그 대화를 이어간다.
// 백엔드 미설정(.env 없음)이면 목업 응답으로 폴백.
export async function sendMessage(
  text: string,
  sessionId?: string,
  attachments?: Attachment[],
  model?: string,
): Promise<SendResult> {
  if (!IS_BACKEND_CONFIGURED) {
    return mockReply(text);
  }

  const res = await fetch(apiUrl('/api/chat'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ text, sessionId, images: toDataUrls(attachments), model }),
  });

  if (!res.ok) {
    throw new Error(`navis 응답 오류: ${res.status}`);
  }

  const data = (await res.json()) as ChatResponse;
  return {
    reply: { ...assistantMessage(data.text), toolsUsed: data.toolsUsed },
    sessionId: data.sessionId,
    contextFull: data.contextFull,
    saved: data.saved,
    toolsUsed: data.toolsUsed ?? [],
  };
}

// 스트리밍 전송 — /api/chat/stream(SSE)로 토큰 델타를 받아 onDelta 로 흘려준다.
// expo/fetch 는 RN 기본 fetch 와 달리 response.body(ReadableStream) 스트리밍을 지원한다.
// 백엔드 미설정이면 목업 응답을 잘게 쪼개 흉내낸다.
export async function sendMessageStream(
  text: string,
  sessionId: string | undefined,
  attachments: Attachment[] | undefined,
  onDelta: (delta: string) => void,
  onStatus?: (tool: string) => void,
  onTool?: (label: string) => void,
  model?: string,
  // 중지 버튼용 — abort 되면 부분 응답을 유지한 채 정상 종료(aborted:true).
  signal?: AbortSignal,
  // 생각 과정(확장 사고) 델타 — 접이식 블록에 누적.
  onThinking?: (delta: string) => void,
  // 백그라운드 완주/푸시용 — 클라가 응답 전에 떠나도(폰 잠금/백그라운드) 서버가
  // 답변을 끝까지 만들어 대화에 써넣고 폰으로 푸시한다. conversationId+snapshot 으로
  // 서버가 어디에 무엇을 append 할지 알고, turnId 로 중지(/api/chat/cancel)를 매칭한다.
  bg?: {
    conversationId?: string;
    turnId?: string;
    snapshot?: { title: string; messages: unknown[]; unread: number; sessionId: string | null };
  },
): Promise<SendResult> {
  if (!IS_BACKEND_CONFIGURED) {
    const result = await mockReply(text);
    for (const ch of result.reply.text.match(/.{1,3}/gu) ?? []) {
      if (signal?.aborted) return { ...result, aborted: true };
      onDelta(ch);
      await new Promise((r) => setTimeout(r, 12));
    }
    return result;
  }

  const res = await expoFetch(apiUrl('/api/chat/stream'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      text,
      sessionId,
      images: toDataUrls(attachments),
      model,
      conversationId: bg?.conversationId,
      turnId: bg?.turnId,
      conversation: bg?.snapshot,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`navis 스트림 오류: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: { text: string; sessionId: string; contextFull: boolean; saved: boolean; toolsUsed?: string[] } | undefined;

  // SSE 프레임은 빈 줄(\n\n)로 구분. event/data 라인을 파싱한다.
  const handleFrame = (frame: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    const payload = JSON.parse(dataLines.join('\n'));
    if (event === 'delta') onDelta(payload.text as string);
    else if (event === 'thinking') onThinking?.(payload.text as string);
    else if (event === 'status') onStatus?.(payload.tool as string);
    else if (event === 'tool') onTool?.(payload.label as string);
    else if (event === 'done') done = payload;
    else if (event === 'error') throw new Error(payload.error ?? '스트림 오류');
  };

  try {
    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (frame.trim()) handleFrame(frame);
      }
    }
  } catch (err) {
    // 사용자가 중지 버튼을 누르면 fetch 가 AbortError 로 끊긴다 → 에러가 아니라
    // 정상 종료로 취급하고, 지금까지 받은 부분 응답을 그대로 유지한다.
    if (signal?.aborted) {
      return {
        reply: assistantMessage(''),
        sessionId: sessionId ?? '',
        contextFull: false,
        saved: false,
        toolsUsed: [],
        aborted: true,
      };
    }
    // 스트림이 도중에 끊겼지만(폰 백그라운드/연결 끊김) 백그라운드 메타(bg)를 보냈다면,
    // 서버가 생성을 끝까지 완주해 응답을 영속 + 폰 푸시한다 → 에러 아님(incomplete).
    // 여기서 throw 하면 호출부가 에러 말풍선을 추가해(updatedAt 갱신) 동기화 LWW 에서
    // 서버 응답을 덮어쓸 수 있으므로, 핸드오프로 조용히 종료한다.
    if (bg?.conversationId) return incompleteResult(sessionId);
    throw err;
  }

  // done 없이 스트림이 끝남 — bg 핸드오프면 서버 완주에 맡기고, 아니면 진짜 비정상.
  if (!done) {
    if (bg?.conversationId) return incompleteResult(sessionId);
    throw new Error('스트림이 비정상 종료됐어');
  }

  return {
    reply: { ...assistantMessage(done.text), text: done.text, toolsUsed: done.toolsUsed },
    sessionId: done.sessionId,
    contextFull: done.contextFull,
    saved: done.saved,
    toolsUsed: done.toolsUsed ?? [],
  };
}

// 챗 중지 — 서버에 turnId 로 명시적 취소를 알린다. 단순히 fetch 를 abort 만 하면
// 서버는 그걸 "백그라운드로 떠남"으로 보고 생성을 계속하므로, 진짜 멈추려면 이걸 부른다.
// fire-and-forget(실패해도 UI 는 이미 멈춤).
export async function cancelChat(turnId: string): Promise<void> {
  if (!IS_BACKEND_CONFIGURED || !turnId) return;
  try {
    await fetch(apiUrl('/api/chat/cancel'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ turnId }),
    });
  } catch {
    /* 무시 */
  }
}

// 백그라운드 핸드오프 — 앱이 백그라운드로 전환될 때(AppState 'background') 진행 중인
// 턴을 서버에 알린다. 연결이 끊겨도(또는 프록시가 끊김을 가려도) 서버가 응답을 끝까지
// 만들어 대화에 영속 + 폰 푸시하도록 하는 명시 신호. fire-and-forget(실패해도 무방 —
// 연결 종료 감지(clientGone)가 폴백으로 남는다).
export async function handoffChat(turnId: string): Promise<void> {
  if (!IS_BACKEND_CONFIGURED || !turnId) return;
  try {
    await fetch(apiUrl('/api/chat/handoff'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ turnId }),
      // 앱이 백그라운드로 전환되며 JS 가 곧 정지돼도 OS 가 전송을 끝내도록 — 비콘이
      // 안 나가면 서버가 백그라운드 완주를 못 타 답이 유실된다(미지원 환경에선 무시됨).
      keepalive: true,
    } as RequestInit);
  } catch {
    /* 무시 */
  }
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
    toolsUsed: [],
  };
}
