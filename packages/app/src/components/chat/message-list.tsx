import { useRef } from 'react';
import { FlatList, View } from 'react-native';
import { ChatBubble } from './chat-bubble';
import { TypingIndicator } from './typing-indicator';
import { Text } from '../ui/text';
import { useActiveConversation, useIsActiveTyping } from '../../store/chat-store';
import type { ChatMessage } from '../../types';

// 활성 대화방의 메시지를 직접 구독 (props 없음)
export function MessageList() {
  const conversation = useActiveConversation();
  const typing = useIsActiveTyping();
  const messages = conversation?.messages ?? [];
  const ref = useRef<FlatList<ChatMessage>>(null);

  const scrollToEnd = () => ref.current?.scrollToEnd({ animated: true });

  return (
    <FlatList
      ref={ref}
      data={messages}
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => <ChatBubble message={item} />}
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
