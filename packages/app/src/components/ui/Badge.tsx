import { View, type ViewProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Text } from './Text';

const badgeVariants = cva('self-start rounded-full px-2.5 py-0.5', {
  variants: {
    variant: {
      default: 'bg-primary',
      secondary: 'bg-secondary',
      outline: 'border border-border bg-transparent',
      destructive: 'bg-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
});

const badgeTextVariants = cva('text-xs font-medium', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      outline: 'text-foreground',
      destructive: 'text-destructive-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export type BadgeProps = ViewProps &
  VariantProps<typeof badgeVariants> & {
    label: string;
    className?: string;
  };

export function Badge({ label, variant, className, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      <Text className={badgeTextVariants({ variant })}>{label}</Text>
    </View>
  );
}
