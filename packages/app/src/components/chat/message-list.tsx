import { useRef } from 'react';
import { FlatList, View } from 'react-native';
import { ChatBubble } from './chat-bubble';
import { TypingIndicator } from './typing-indicator';
import { Text } from '../ui/text';
import { useActiveConversation, useIsActiveTyping, useChatStore } from '../../store/chat-store';
import type { ChatMessage } from '../../types';

// 활성 대화방의 메시지를 직접 구독 (props 없음)
export function MessageList() {
  const conversation = useActiveConversation();
  const typing = useIsActiveTyping();
  const messages = conversation?.messages ?? [];
  // 지금 스트리밍 중인 응답 말풍선 id — 그 말풍선만 작업/생각 블록을 자동으로 펼친다.
  // index 추정 대신 정확한 id 매칭이라, 직전 답변이 잠깐 펼쳐지는 깜빡임이 없다.
  const streamingId = useChatStore((s) => (conversation ? s.streamingId[conversation.id] : undefined));
  const ref = useRef<FlatList<ChatMessage>>(null);

  const scrollToEnd = () => ref.current?.scrollToEnd({ animated: true });

  return (
    <FlatList
      ref={ref}
      data={messages}
      keyExtractor={(m) => m.id}
      // streamingId 가 바뀌면 해당 말풍선이 자동 펼침/접힘 되도록 재렌더 강제.
      extraData={streamingId}
      renderItem={({ item }) => (
        <ChatBubble message={item} streaming={item.id === streamingId} />
      )}
      contentContainerStyle={{
        paddingHorizontal: 12,
        paddingVertical: 16,
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
      onContentSizeChange={scrollToEnd}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center">
          <Text variant="muted">
            {conversation?.kind === 'report' ? '아직 받은 보고가 없어' : '새 대화를 시작해봐'}
          </Text>
        </View>
      }
      ListFooterComponent={
        typing ? (
          <View className="px-1">
            <TypingIndicator />
          </View>
        ) : null
      }
    />
  );
}
