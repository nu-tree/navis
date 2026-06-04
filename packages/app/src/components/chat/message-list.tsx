import { useRef } from 'react';
import { FlatList, View } from 'react-native';
import { ChatBubble } from './chat-bubble';
import { TypingIndicator } from './typing-indicator';
import type { ChatMessage } from '../../types';

export type MessageListProps = {
  messages: ChatMessage[];
  typing?: boolean;
};

export function MessageList({ messages, typing }: MessageListProps) {
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
      ListFooterComponent={typing ? <View className="px-1"><TypingIndicator /></View> : null}
    />
  );
}
