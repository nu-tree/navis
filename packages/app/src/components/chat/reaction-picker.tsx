import { Modal, Pressable, View } from 'react-native';
import { Text } from '../ui/text';

// 빠른 이모지 (💡 = namory 저장 표시, 디스코드 리액션 느낌)
const QUICK_EMOJIS = ['💡', '👍', '❤️', '😂', '🎉', '🔥', '✅', '👀'];

export type ReactionPickerProps = {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
  // 텍스트가 있을 때만 노출되는 복사 액션 (롱프레스가 네이티브 복사 메뉴를 가로채서 필요)
  onCopy?: () => void;
};

export function ReactionPicker({ open, onClose, onPick, onCopy }: ReactionPickerProps) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/50 px-8" onPress={onClose}>
        <Pressable
          className="items-stretch gap-2 rounded-2xl border border-border bg-card p-3"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="flex-row flex-wrap items-center justify-center gap-2">
            {QUICK_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onPick(emoji)}
                className="h-11 w-11 items-center justify-center rounded-full active:bg-secondary"
              >
                <Text className="text-2xl">{emoji}</Text>
              </Pressable>
            ))}
          </View>

          {onCopy ? (
            <Pressable
              onPress={onCopy}
              className="flex-row items-center justify-center gap-2 rounded-xl border-t border-border pt-3 active:opacity-70"
            >
              <Text className="text-base">📋</Text>
              <Text className="text-[15px] font-semibold text-foreground">복사</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
