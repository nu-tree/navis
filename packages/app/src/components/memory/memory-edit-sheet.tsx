import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/text';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, type SelectOption } from '../ui/select';
import type { Memory, MemoryPatch } from '../../api/navis';

const CATEGORY_OPTIONS: SelectOption[] = [
  { label: '결정 (decision)', value: 'decision' },
  { label: '배움 (learning)', value: 'learning' },
  { label: '아이디어 (idea)', value: 'idea' },
  { label: '감정 (feeling)', value: 'feeling' },
  { label: '사람 (people)', value: 'people' },
  { label: '할 일 (todo)', value: 'todo' },
];

export type MemoryEditSheetProps = {
  memory: Memory | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (id: string, patch: MemoryPatch) => void;
};

export function MemoryEditSheet({ memory, saving, onClose, onSave }: MemoryEditSheetProps) {
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string | undefined>(undefined);

  // 대상 기억이 바뀌면 폼 초기화
  useEffect(() => {
    setContent(memory?.content ?? '');
    setCategory(memory?.category ?? undefined);
  }, [memory]);

  const submit = () => {
    if (!memory) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    onSave(memory.id, { content: trimmed, category });
  };

  return (
    <Modal visible={!!memory} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable className="absolute inset-0 bg-black/50" onPress={onClose} />
        <View
          className="gap-3 rounded-t-2xl border border-border bg-card px-4 pt-4"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <View className="mb-1 h-1 w-10 self-center rounded-full bg-border" />
          <Text variant="subtitle">기억 수정</Text>

          <Input
            value={content}
            onChangeText={setContent}
            placeholder="기억 내용…"
            multiline
            className="max-h-48 min-h-24"
            style={{ textAlignVertical: 'top' }}
          />

          <View>
            <Text variant="caption" className="mb-1 text-muted-foreground">
              분류
            </Text>
            <Select
              options={CATEGORY_OPTIONS}
              value={category}
              placeholder="분류 선택 (선택)"
              onValueChange={setCategory}
            />
          </View>

          <View className="mt-1 flex-row gap-2">
            <Button label="취소" variant="secondary" className="flex-1" onPress={onClose} />
            <Button label="저장" className="flex-1" loading={saving} onPress={submit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
