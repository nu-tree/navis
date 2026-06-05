import { Pressable, ScrollView, View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from '../ui/text';
import { useChatStore, type Conversation } from '../../store/chat-store';

export type ConversationListProps = {
  // 대화방 선택/생성 후 호출 (드로어 닫기 등)
  onAfterSelect?: () => void;
};

function preview(conv: Conversation): string {
  const last = conv.messages[conv.messages.length - 1];
  if (!last) return conv.kind === 'report' ? '아직 보고가 없어' : '새 대화';
  return last.text.replace(/\s+/g, ' ').slice(0, 38);
}

function Row({
  conv,
  active,
  onPress,
  onDelete,
}: {
  conv: Conversation;
  active: boolean;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const unread = conv.unread ?? 0;
  const hasUnread = unread > 0;
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'mb-1 flex-row items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-colors active:opacity-80',
        active ? 'bg-secondary' : 'bg-transparent hover:bg-muted',
      )}
    >
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className={cn('text-sm', (active || hasUnread) && 'font-semibold')}
        >
          {conv.title}
        </Text>
        <Text
          variant="caption"
          numberOfLines={1}
          className={cn(hasUnread ? 'text-foreground' : 'text-muted-foreground')}
        >
          {preview(conv)}
        </Text>
      </View>
      {hasUnread ? (
        <View className="min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 py-0.5">
          <Text className="text-xs font-bold text-destructive-foreground">
            {unread > 99 ? '99+' : unread}
          </Text>
        </View>
      ) : null}
      {onDelete ? (
        <Pressable
          hitSlop={8}
          onPress={onDelete}
          className="rounded-md px-1.5 py-1 cursor-pointer active:opacity-60 hover:bg-secondary"
        >
          <Text className="text-muted-foreground">✕</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="caption" className="px-3 pb-1 pt-3 uppercase tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

export function ConversationList({ onAfterSelect }: ConversationListProps) {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const chats = conversations.filter((c) => c.kind === 'chat');
  const reports = conversations.filter((c) => c.kind === 'report');

  const select = (id: string) => {
    selectConversation(id);
    onAfterSelect?.();
  };

  return (
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 24 }}>
        <SectionLabel>대화</SectionLabel>
        {chats.map((c) => (
          <Row
            key={c.id}
            conv={c}
            active={c.id === activeId}
            onPress={() => select(c.id)}
            onDelete={() => deleteConversation(c.id)}
          />
        ))}

        <SectionLabel>보고</SectionLabel>
        {reports.map((c) => (
          <Row key={c.id} conv={c} active={c.id === activeId} onPress={() => select(c.id)} />
        ))}
      </ScrollView>
    </View>
  );
}
