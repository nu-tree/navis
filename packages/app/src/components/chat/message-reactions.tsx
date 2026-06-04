import { Pressable, View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from '../ui/text';

export type MessageReactionsProps = {
  reactions: string[];
  onToggle: (emoji: string) => void;
  alignEnd?: boolean;
  className?: string;
};

// 메시지에 달린 이모지 칩들. 탭하면 제거(토글).
export function MessageReactions({ reactions, onToggle, alignEnd, className }: MessageReactionsProps) {
  if (reactions.length === 0) return null;
  return (
    <View
      className={cn(
        'mt-1 flex-row flex-wrap gap-1',
        alignEnd ? 'justify-end' : 'justify-start',
        className,
      )}
    >
      {reactions.map((emoji) => (
        <Pressable
          key={emoji}
          onPress={() => onToggle(emoji)}
          className="flex-row items-center rounded-full border border-border bg-secondary px-2 py-0.5 active:opacity-70"
        >
          <Text className="text-sm">{emoji}</Text>
        </Pressable>
      ))}
    </View>
  );
}
