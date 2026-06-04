import { View } from 'react-native';
import { cn } from '../../lib/cn';

export type TypingIndicatorProps = {
  className?: string;
};

// navis 가 응답 생성 중일 때 표시하는 점 3개
export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <View
      className={cn(
        'mb-3 max-w-[82%] flex-row items-center gap-1 self-start rounded-2xl rounded-bl-md bg-card px-4 py-3',
        className,
      )}
    >
      <View className="h-2 w-2 rounded-full bg-muted-foreground opacity-40" />
      <View className="h-2 w-2 rounded-full bg-muted-foreground opacity-70" />
      <View className="h-2 w-2 rounded-full bg-muted-foreground" />
    </View>
  );
}
