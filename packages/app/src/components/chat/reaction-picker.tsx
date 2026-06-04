import { Modal, Pressable, View } from 'react-native';
import { Text } from '../ui/text';

// 빠른 이모지 (💡 = namory 저장 표시, 디스코드 리액션 느낌)
const QUICK_EMOJIS = ['💡', '👍', '❤️', '😂', '🎉', '🔥', '✅', '👀'];

export type ReactionPickerProps = {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
};

export function ReactionPicker({ open, onClose, onPick }: ReactionPickerProps) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/50 px-8" onPress={onClose}>
        <Pressable
          className="flex-row flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3"
          onPress={(e) => e.stopPropagation()}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => onPick(emoji)}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-secondary"
            >
              <Text className="text-2xl">{emoji}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
