import { useMutation } from '@tanstack/react-query';
import { sendMessage } from '../api/navis';
import { useChatStore } from '../store/chat-store';
import { makeId } from '../lib/id';

// 메시지 전송 = TanStack Query mutation
// - onMutate: 유저 메시지 낙관적 추가 + typing 표시
// - onSuccess: 나비스 응답 추가
// - onSettled: typing 해제
export function useSendMessage() {
  const addMessage = useChatStore((s) => s.addMessage);
  const setTyping = useChatStore((s) => s.setTyping);

  const mutation = useMutation({
    mutationFn: (text: string) => sendMessage(text),
    onMutate: (text) => {
      addMessage({
        id: makeId('u'),
        role: 'user',
        text,
        createdAt: new Date().toISOString(),
      });
      setTyping(true);
    },
    onSuccess: (reply) => {
      addMessage(reply);
    },
    onSettled: () => {
      setTyping(false);
    },
  });

  return { send: mutation.mutate, isPending: mutation.isPending };
}
