import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/format';
import { Text } from '../ui/text';
import { useChatStore } from '../../store/chat-store';
import { ReactionPicker } from './reaction-picker';
import { MessageReactions } from './message-reactions';
import type { ChatMessage } from '../../types';

export type ChatBubbleProps = {
  message: ChatMessage;
  className?: string;
};

export function ChatBubble({ message, className }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const [pickerOpen, setPickerOpen] = useState(false);
  const activeId = useChatStore((s) => s.activeId);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const reactions = message.reactions ?? [];

  return (
    <View
      className={cn(
        'mb-3 max-w-[82%]',
        isUser ? 'items-end self-end' : 'items-start self-start',
        className,
      )}
    >
      <Pressable onLongPress={() => setPickerOpen(true)} delayLongPress={250}>
        <View
          className={cn(
            'rounded-2xl px-4 py-2.5',
            isUser ? 'rounded-br-md bg-primary' : 'rounded-bl-md bg-card',
          )}
        >
          <Text
            className={cn(
              'text-[15px] leading-5',
              isUser ? 'text-primary-foreground' : 'text-card-foreground',
            )}
          >
            {message.text}
          </Text>
        </View>
      </Pressable>

      <MessageReactions
        reactions={reactions}
        alignEnd={isUser}
        onToggle={(emoji) => toggleReaction(activeId, message.id, emoji)}
      />

      <Text variant="caption" className="mt-1 px-1 text-muted-foreground">
        {formatTime(message.createdAt)}
      </Text>

      <ReactionPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(emoji) => {
          toggleReaction(activeId, message.id, emoji);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}
