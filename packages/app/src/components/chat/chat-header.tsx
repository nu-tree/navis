import { View } from 'react-native';
import { cn } from '../../lib/cn';
import { Avatar } from '../ui/avatar';
import { Text } from '../ui/text';

export type ChatHeaderProps = {
  title: string;
  subtitle?: string;
  className?: string;
};

export function ChatHeader({ title, subtitle, className }: ChatHeaderProps) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-3 border-b border-border bg-background px-4 py-3',
        className,
      )}
    >
      <Avatar fallback="나" size={38} className="bg-primary" />
      <View>
        <Text variant="subtitle">{title}</Text>
        {subtitle ? (
          <Text variant="caption" className="text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
