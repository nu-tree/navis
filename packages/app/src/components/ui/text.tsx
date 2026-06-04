import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const textVariants = cva('text-foreground', {
  variants: {
    variant: {
      title: 'text-2xl font-bold',
      subtitle: 'text-base font-semibold',
      body: 'text-[15px] leading-5',
      label: 'text-sm font-medium',
      caption: 'text-xs',
      muted: 'text-sm text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'body' },
});

export type TextProps = RNTextProps &
  VariantProps<typeof textVariants> & {
    className?: string;
  };

export function Text({ className, variant, ...props }: TextProps) {
  return <RNText className={cn(textVariants({ variant }), className)} {...props} />;
}
