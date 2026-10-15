"use client";

import Link from "next/link";
import { ChatInput } from "./chat-input";
import { ClaudeConnectCard } from "./claude-connect-card";
import { MessageBubble } from "./message-bubble";
import { MessageList } from "./message-list";
import { TypingIndicator } from "./typing-indicator";
import { useStickToBottom } from "@/hooks/common/use-stick-to-bottom";
import { useChat } from "@/hooks/pages/chat/use-chat";
import { useConversationMessageList } from "@/hooks/apis/conversation/use-conversation-message-list";
import { useLoadOlderMessages } from "@/hooks/pages/chat/use-load-older-messages";
import { useSyncLatestMessages } from "@/hooks/pages/chat/use-sync-latest-messages";
import { useDeleteConversationMessage } from "@/hooks/apis/conversation/use-delete-conversation-message";

type Props = {
  /** 열려 있는 방. 아직 첫 메시지를 보내지 않은 새 방도 id 를 갖는다. */
  conversationId: string;
  /** 턴이 끝난 뒤 방 목록을 갱신한다. */
  onTurnEnd?: () => void;
  /** 다른 탭에 있다가 답 알림을 누르면 그 방을 연다. */
  onOpen?: (conversationId: string) => void;
};

export const ChatPanel = ({ conversationId, onTurnEnd, onOpen }: Readonly<Props>) => {
  const { data: messages = [] } = useConversationMessageList(conversationId);
  const { mutate: removeMessage } = useDeleteConversationMessage(conversationId);
  const { streaming, tool, error, errorCode, send, stop } = useChat({
    conversationId,
    ...(onTurnEnd ? { onTurnEnd } : {}),
    ...(onOpen ? { onOpen: () => onOpen(conversationId) } : {}),
  });
  // 새 메시지·델타가 오면 바닥으로 따라간다. 위로 올려 읽는 중이면 그대로 둔다.
  const { ref: scrollRef, onScroll, stick } = useStickToBottom<HTMLDivElement>([messages, streaming]);
  // 위로 올리면 이전 메시지를 더 불러온다(specs/003 FR-026).
  const { onScroll: onScrollTop } = useLoadOlderMessages(conversationId, messages, scrollRef);
  // 나비스가 먼저 건 말을 새로고침 없이 보이게(specs/003).
  useSyncLatestMessages(conversationId);

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
              말한 건 알아서 기억하고, 때가 되면 먼저 말을 걸어요.
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
          onScroll={() => {
            onScroll();
            onScrollTop();
          }}
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
          {/* 나비스 말풍선 줄(프로필 자리 다음)에 맞춘다. */}
          {busy && !streaming ? <TypingIndicator label={tool ?? undefined} className="mt-4 pl-10" /> : null}

          {error ? (
            <p className="mt-4 text-sm text-destructive">
              ⚠️ {error}
              {/* 토큰 문제면 고칠 곳으로 바로 보낸다(FR-056). */}
              {errorCode ? (
                <Link href="/settings" className="ml-2 font-medium underline underline-offset-4">
                  설정으로 가기
                </Link>
              ) : null}
            </p>
          ) : null}
        </MessageList>
      )}

      <div className="px-4">
        <ClaudeConnectCard errorCode={errorCode} />
      </div>
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

// 첫 화면의 예시. 나비스가 잘하는 셋을 한 번씩 보여준다 — 기억 남기기(1), 약속(2 · 3), 기억 꺼내기(4).
// 1 은 날짜가 걸린 말이라 나비스가 "전날 짚어 드릴까요?" 하고 약속을 제안하는 것까지 이어진다.
const EMPTY_HINTS = [
  "17일에 친구 결혼식 있어",
  "16일 저녁에 축의금 챙기라고 알려줘",
  "매일 아침 8시에 오늘 할 일 정리해줘",
  "이사 관련해서 내가 저번에 뭐라고 했었지?",
];
