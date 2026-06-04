import { useMutation } from '@tanstack/react-query';
import { sendMessage } from '../api/navis';
import { useChatStore } from '../store/chat-store';
import { makeId } from '../lib/id';

// 메시지 전송 = TanStack Query mutation
// - onMutate: 유저 메시지 낙관적 추가 + typing 표시
// - mutationFn: 스토어의 현재 sessionId 로 navis 호출(멀티턴)
// - onSuccess: 나비스 응답 추가 + 세션 갱신(컨텍스트 한도 넘으면 리셋)
// - onError: 연결 실패 안내 버블
// - onSettled: typing 해제
export function useSendMessage() {
  const addMessage = useChatStore((s) => s.addMessage);
  const setTyping = useChatStore((s) => s.setTyping);
  const setSessionId = useChatStore((s) => s.setSessionId);
  const clearSession = useChatStore((s) => s.clearSession);

  const mutation = useMutation({
    mutationFn: (text: string) => sendMessage(text, useChatStore.getState().sessionId),
    onMutate: (text) => {
      addMessage({
        id: makeId('u'),
        role: 'user',
        text,
        createdAt: new Date().toISOString(),
      });
      setTyping(true);
    },
    onSuccess: ({ reply, sessionId, contextFull }) => {
      addMessage(reply);
      if (sessionId && !contextFull) {
        setSessionId(sessionId);
      } else {
        clearSession();
      }
    },
    onError: () => {
      addMessage({
        id: makeId('a'),
        role: 'assistant',
        text: '⚠️ 나비스 서버에 연결하지 못했어. 잠시 후 다시 시도해줘.',
        createdAt: new Date().toISOString(),
      });
    },
    onSettled: () => {
      setTyping(false);
    },
  });

  return { send: mutation.mutate, isPending: mutation.isPending };
}
