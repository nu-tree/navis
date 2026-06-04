import { FlatList, Pressable, View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from '../ui/text';
import { Button } from '../ui/button';
import { useChatStore, type Conversation } from '../../store/chat-store';

export type ConversationListProps = {
  // 대화방 선택/생성 후 호출 (드로어 닫기 등)
  onAfterSelect?: () => void;
};

function preview(conv: Conversation): string {
  const last = conv.messages[conv.messages.length - 1];
  if (!last) return '새 대화';
  return last.text.replace(/\s+/g, ' ').slice(0, 38);
}

export function ConversationList({ onAfterSelect }: ConversationListProps) {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const newConversation = useChatStore((s) => s.newConversation);

  const handleSelect = (id: string) => {
    selectConversation(id);
    onAfterSelect?.();
  };

  const handleNew = () => {
    newConversation();
    onAfterSelect?.();
  };

  return (
    <View className="flex-1">
      <View className="px-3 pb-2 pt-1">
        <Button label="＋  새 대화" variant="secondary" onPress={handleNew} />
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}
        renderItem={({ item }) => {
          const active = item.id === activeId;
          return (
            <Pressable
              onPress={() => handleSelect(item.id)}
              className={cn(
                'mb-1 flex-row items-center gap-2 rounded-xl px-3 py-2.5 active:opacity-80',
                active ? 'bg-secondary' : 'bg-transparent',
              )}
            >
              <View className="flex-1">
                <Text
                  numberOfLines={1}
                  className={cn('text-sm', active ? 'font-semibold text-foreground' : 'text-foreground')}
                >
                  {item.title}
                </Text>
                <Text variant="caption" numberOfLines={1} className="text-muted-foreground">
                  {preview(item)}
                </Text>
              </View>
              <Pressable
                hitSlop={8}
                onPress={() => deleteConversation(item.id)}
                className="px-1.5 py-1 active:opacity-60"
              >
                <Text className="text-muted-foreground">✕</Text>
              </Pressable>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
