import { View } from 'react-native';
import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/format';
import { Text } from '../ui/text';
import type { ChatMessage } from '../../types';

export type ChatBubbleProps = {
  message: ChatMessage;
  className?: string;
};

export function ChatBubble({ message, className }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  return (
    <View
      className={cn(
        'mb-3 max-w-[82%]',
        isUser ? 'items-end self-end' : 'items-start self-start',
        className,
      )}
    >
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
      <Text variant="caption" className="mt-1 px-1 text-muted-foreground">
        {formatTime(message.createdAt)}
      </Text>
    </View>
  );
}
