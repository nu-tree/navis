import { Pressable, View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from '../ui/text';
import { Avatar } from '../ui/avatar';
import { NAVIS_LOGO } from '../../lib/assets';

export type ChatHeaderProps = {
  title: string;
  subtitle?: string;
  onMenu: () => void;
  onNewChat: () => void;
  // 다른 방의 안 읽은 메시지 총합 (>0 이면 ☰ 위에 빨간 점)
  unread?: number;
  className?: string;
};

export function ChatHeader({
  title,
  subtitle,
  onMenu,
  onNewChat,
  unread = 0,
  className,
}: ChatHeaderProps) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-2 border-b border-border bg-background px-2 py-2.5',
        className,
      )}
    >
      <Pressable hitSlop={8} onPress={onMenu} className="h-9 w-9 items-center justify-center rounded-lg active:bg-secondary">
        <Text className="text-xl text-foreground">☰</Text>
        {unread > 0 ? (
          <View className="absolute right-1 top-1 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1">
            <Text className="text-[10px] font-bold text-destructive-foreground">
              {unread > 99 ? '99+' : unread}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Avatar source={NAVIS_LOGO} size={30} className="rounded-lg bg-transparent" />

      <View className="flex-1">
        <Text variant="subtitle" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" className="text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Pressable hitSlop={8} onPress={onNewChat} className="h-9 w-9 items-center justify-center rounded-lg active:bg-secondary">
        <Text className="text-2xl text-foreground">＋</Text>
      </Pressable>
    </View>
  );
}
