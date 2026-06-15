import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from './text';
import { Icon } from './icon';
import { Separator } from './separator';

export type SelectOption = {
  label: string;
  value: string;
};

export type SelectProps = {
  options: SelectOption[];
  value?: string;
  placeholder?: string;
  onValueChange: (value: string) => void;
  className?: string;
};

export function Select({
  options,
  value,
  placeholder = '선택…',
  onValueChange,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const pick = (next: string) => {
    onValueChange(next);
    setOpen(false);
  };

  return (
    <>
      {/* Trigger */}
      <Pressable
        onPress={() => setOpen(true)}
        className={cn(
          'h-11 flex-row items-center justify-between rounded-xl border border-border bg-input px-4 active:opacity-80',
          className,
        )}
      >
        <Text className={cn(selected ? 'text-foreground' : 'text-muted-foreground')}>
          {selected ? selected.label : placeholder}
        </Text>
        <Icon name="chevron-down" size={16} tone="muted-foreground" />
      </Pressable>

      {/* Bottom sheet */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setOpen(false)}>
          <Pressable
            className="rounded-t-2xl border border-border bg-card pb-6 pt-2"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="mb-2 h-1 w-10 self-center rounded-full bg-border" />
            {options.map((opt, i) => {
              const active = opt.value === value;
              return (
                <View key={opt.value}>
                  {i > 0 ? <Separator /> : null}
                  <Pressable
                    onPress={() => pick(opt.value)}
                    className="flex-row items-center justify-between px-5 py-3.5 active:bg-secondary"
                  >
                    <Text className={cn(active ? 'font-semibold text-primary' : 'text-foreground')}>
                      {opt.label}
                    </Text>
                    {active ? <Icon name="check" size={16} tone="primary" /> : null}
                  </Pressable>
                </View>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
