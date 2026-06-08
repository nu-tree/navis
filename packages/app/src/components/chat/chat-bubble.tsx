import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/format';
import { Text } from '../ui/text';
import { useChatStore } from '../../store/chat-store';
import { ReactionPicker } from './reaction-picker';
import { MessageReactions } from './message-reactions';
import { MarkdownText } from './markdown-text';
import { WorkDetails } from './work-details';
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
  const images = message.images ?? [];
  const hasText = message.text.trim().length > 0;
  const toolsUsed = !isUser ? (message.toolsUsed ?? []) : [];
  const thinking = !isUser ? message.thinking : undefined;
  // 작업/생각 과정 접이식 블록을 보여줄지 — 둘 중 하나라도 있으면.
  const hasWork = toolsUsed.length > 0 || !!thinking?.trim();

  const copyText = async () => {
    if (hasText) await Clipboard.setStringAsync(message.text);
    setPickerOpen(false);
  };

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
            'overflow-hidden rounded-2xl',
            (hasText || hasWork) && 'px-4 py-2.5',
            isUser ? 'rounded-br-md bg-primary' : 'rounded-bl-md bg-card',
          )}
        >
          {hasWork ? <WorkDetails thinking={thinking} toolsUsed={toolsUsed} /> : null}
          {images.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              className={cn('mb-1 h-48 w-60 rounded-xl bg-secondary', !hasText && 'mb-0')}
              resizeMode="cover"
            />
          ))}
          {hasText ? (
            isUser ? (
              <Text selectable className="text-[15px] leading-5 text-primary-foreground">
                {message.text}
              </Text>
            ) : (
              // 어시스턴트(보고/응답)는 마크다운으로 렌더링 — #·**·- 등이 서식으로 보인다.
              <MarkdownText text={message.text} className="text-card-foreground" />
            )
          ) : null}
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
        onCopy={hasText ? copyText : undefined}
        onPick={(emoji) => {
          toggleReaction(activeId, message.id, emoji);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}
