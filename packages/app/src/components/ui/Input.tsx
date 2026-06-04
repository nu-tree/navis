import { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '../../lib/cn';

export type InputProps = TextInputProps & {
  className?: string;
};

export const Input = forwardRef<TextInput, InputProps>(({ className, ...props }, ref) => {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="#6b7280"
      className={cn(
        'min-h-11 rounded-xl bg-input px-4 py-2.5 text-[15px] text-foreground',
        className,
      )}
      {...props}
    />
  );
});

Input.displayName = 'Input';
