import { useState } from 'react';
import { View } from 'react-native';
import { cn } from '../../lib/cn';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Text } from '../ui/text';

export type ChatInputProps = {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export function ChatInput({
  onSend,
  disabled,
  placeholder = '메시지 입력…',
  className,
}: ChatInputProps) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <View
      className={cn(
        'flex-row items-end gap-2 border-t border-border bg-background px-3 py-2',
        className,
      )}
    >
      <Input
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        multiline
        className="max-h-32 flex-1"
      />
      <Button size="icon" className="rounded-full" disabled={!canSend} onPress={submit}>
        <Text className="text-lg text-primary-foreground">↑</Text>
      </Button>
    </View>
  );
}
