import { useRef } from 'react';
import { FlatList, View } from 'react-native';
import { ChatBubble } from './chat-bubble';
import { TypingIndicator } from './typing-indicator';
import { useChatStore } from '../../store/chat-store';
import type { ChatMessage } from '../../types';

// 채팅 스토어를 직접 구독 (props 없음)
export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const typing = useChatStore((s) => s.typing);
  const ref = useRef<FlatList<ChatMessage>>(null);

  const scrollToEnd = () => ref.current?.scrollToEnd({ animated: true });

  return (
    <FlatList
      ref={ref}
      data={messages}
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => <ChatBubble message={item} />}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 16 }}
      showsVerticalScrollIndicator={false}
      onContentSizeChange={scrollToEnd}
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
