"use client";

import { ChatInput } from "./chat-input";
import { MessageBubble } from "./message-bubble";
import { MessageList } from "./message-list";
import { TypingIndicator } from "./typing-indicator";
import { useStickToBottom } from "@/hooks/common/use-stick-to-bottom";
import { useChat } from "@/hooks/pages/chat/use-chat";
import { useConversationMessageList } from "@/hooks/apis/conversation/use-conversation-message-list";
import { useDeleteConversationMessage } from "@/hooks/apis/conversation/use-delete-conversation-message";

type Props = {
  /** 열려 있는 방. 아직 첫 메시지를 보내지 않은 새 방도 id 를 갖는다. */
  conversationId: string;
  /** 턴이 끝난 뒤 방 목록을 갱신한다. */
  onTurnEnd?: () => void;
};

export const ChatPanel = ({ conversationId, onTurnEnd }: Readonly<Props>) => {
  const { data: messages = [] } = useConversationMessageList(conversationId);
  const { mutate: removeMessage } = useDeleteConversationMessage(conversationId);
  const { streaming, tool, error, send, stop } = useChat({
    conversationId,
    ...(onTurnEnd ? { onTurnEnd } : {}),
  });
  // 새 메시지·델타가 오면 바닥으로 따라간다. 위로 올려 읽는 중이면 그대로 둔다.
  const { ref: scrollRef, onScroll, stick } = useStickToBottom<HTMLDivElement>([messages, streaming]);

  const busy = streaming !== null;
  const empty = messages.length === 0 && !busy;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {empty ? (
        // 처음 여는 사용자가 안내 없이 첫 기억을 남기게 해야 한다(SC-012).
        // "무엇을 도와드릴까요?" 만으로는 이게 기억하는 도구라는 걸 알 수 없다.
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4">
          <div className="space-y-1.5 text-center">
            <p className="text-lg font-medium">무엇을 도와드릴까요?</p>
            <p className="text-sm text-muted-foreground">
              말한 것 중 기억할 만한 건 알아서 남겨둬요.
            </p>
          </div>

          <ul className="w-full max-w-md space-y-1.5 text-sm text-muted-foreground">
            {EMPTY_HINTS.map((hint) => (
              <li
                key={hint}
                className="rounded-lg border border-border/60 px-3 py-2"
              >
                {hint}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <MessageList
          ref={scrollRef}
          onScroll={onScroll}
          messages={messages}
          onRemove={removeMessage}
        >
          {/* 스트리밍 중인 답변. 확정되면 done 이벤트가 messages 로 옮긴다. */}
          {streaming ? (
            <MessageBubble
              message={{
                id: "streaming",
                role: "assistant",
                text: streaming,
                createdAt: "",
              }}
            />
          ) : null}

          {/* 첫 토큰 전 — 빈 말풍선 대신 진행 표시를 보여준다. */}
          {busy && !streaming ? <TypingIndicator label={tool ?? undefined} /> : null}

          {error ? (
            <p className="text-sm text-destructive">⚠️ {error}</p>
          ) : null}
        </MessageList>
      )}

      <ChatInput
        busy={busy}
        onSend={(input) => {
          // 보낸 직후엔 읽던 위치와 상관없이 바닥으로 — 내 질문과 답이 보여야 한다.
          stick();
          void send(input);
        }}
        onStop={stop}
      />
    </div>
  );
};

// 첫 화면의 예시. 저장(첫째·둘째)과 불러오기(셋째)를 각각 한 번 보여줘서
// 이 도구가 무엇을 하는지 한눈에 알게 한다.
const EMPTY_HINTS = [
  "이번 분기엔 나비스에 집중하기로 했어",
  "장 볼 것: 세탁세제, 건조대",
  "내가 배포 관련해서 뭐라고 했었지?",
];
