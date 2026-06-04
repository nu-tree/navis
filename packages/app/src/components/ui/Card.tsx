import { View, type ViewProps } from 'react-native';
import { cn } from '../../lib/cn';
import { Text, type TextProps } from './Text';

export type CardProps = ViewProps & { className?: string };

export function Card({ className, ...props }: CardProps) {
  return (
    <View
      className={cn('rounded-2xl border border-border bg-card p-4', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: CardProps) {
  return <View className={cn('mb-2 gap-1', className)} {...props} />;
}

export function CardTitle({ className, ...props }: TextProps) {
  return <Text variant="subtitle" className={cn('text-card-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }: TextProps) {
  return <Text variant="muted" className={className} {...props} />;
}

export function CardContent({ className, ...props }: CardProps) {
  return <View className={className} {...props} />;
}

export function CardFooter({ className, ...props }: CardProps) {
  return <View className={cn('mt-3 flex-row items-center gap-2', className)} {...props} />;
}
