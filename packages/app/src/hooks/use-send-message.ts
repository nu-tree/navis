import { useMutation } from '@tanstack/react-query';
import { sendMessage } from '../api/navis';
import { useChatStore } from '../store/chat-store';
import { makeId } from '../lib/id';

type SendVars = { text: string; conversationId: string };

// 메시지 전송 = TanStack Query mutation. 대화방(conversationId) 단위로 동작해
// 각 방이 독립 세션·typing 상태를 가진다.
export function useSendMessage() {
  const mutation = useMutation({
    mutationFn: ({ text, conversationId }: SendVars) => {
      const conv = useChatStore.getState().conversations.find((c) => c.id === conversationId);
      return sendMessage(text, conv?.sessionId);
    },
    onMutate: ({ text, conversationId }) => {
      const { addMessage, setTyping } = useChatStore.getState();
      const userMessageId = makeId('u');
      addMessage(conversationId, {
        id: userMessageId,
        role: 'user',
        text,
        createdAt: new Date().toISOString(),
      });
      setTyping(conversationId, true);
      // onSuccess 에서 💡 부착에 쓸 유저 메시지 id 를 context 로 넘김
      return { userMessageId };
    },
    onSuccess: ({ reply, sessionId, contextFull, saved }, { conversationId }, context) => {
      const { addMessage, setSessionId, toggleReaction } = useChatStore.getState();
      addMessage(conversationId, reply);
      setSessionId(conversationId, sessionId && !contextFull ? sessionId : undefined);
      // 저장됐으면 유저 메시지에 💡 (디스코드와 동일)
      if (saved && context?.userMessageId) {
        toggleReaction(conversationId, context.userMessageId, '💡');
      }
    },
    onError: (_err, { conversationId }) => {
      useChatStore.getState().addMessage(conversationId, {
        id: makeId('a'),
        role: 'assistant',
        text: '⚠️ 나비스 서버에 연결하지 못했어. 잠시 후 다시 시도해줘.',
        createdAt: new Date().toISOString(),
      });
    },
    onSettled: (_data, _err, { conversationId }) => {
      useChatStore.getState().setTyping(conversationId, false);
    },
  });

  // 현재 활성 대화방으로 전송
  const send = (text: string) => {
    const { activeId } = useChatStore.getState();
    mutation.mutate({ text, conversationId: activeId });
  };

  return { send };
}
