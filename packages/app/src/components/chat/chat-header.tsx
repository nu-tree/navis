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
  className?: string;
};

export function ChatHeader({ title, subtitle, onMenu, onNewChat, className }: ChatHeaderProps) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-2 border-b border-border bg-background px-2 py-2.5',
        className,
      )}
    >
      <Pressable hitSlop={8} onPress={onMenu} className="h-9 w-9 items-center justify-center rounded-lg active:bg-secondary">
        <Text className="text-xl text-foreground">☰</Text>
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
