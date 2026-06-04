import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Text } from './text';

const buttonVariants = cva(
  'flex-row items-center justify-center gap-2 rounded-xl active:opacity-80',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        secondary: 'bg-secondary',
        outline: 'border border-border bg-transparent',
        ghost: 'bg-transparent active:bg-secondary',
        destructive: 'bg-destructive',
      },
      size: {
        sm: 'h-9 px-3',
        md: 'h-11 px-4',
        lg: 'h-12 px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

const buttonTextVariants = cva('text-[15px] font-semibold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      outline: 'text-foreground',
      ghost: 'text-foreground',
      destructive: 'text-destructive-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export type ButtonProps = PressableProps &
  VariantProps<typeof buttonVariants> & {
    label?: string;
    loading?: boolean;
    className?: string;
    textClassName?: string;
    children?: ReactNode;
  };

export function Button({
  label,
  loading,
  variant,
  size,
  className,
  textClassName,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      className={cn(buttonVariants({ variant, size }), isDisabled && 'opacity-50', className)}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color="#fafafa" />
      ) : (
        children ??
        (label ? (
          <Text className={cn(buttonTextVariants({ variant }), textClassName)}>{label}</Text>
        ) : null)
      )}
    </Pressable>
  );
}
