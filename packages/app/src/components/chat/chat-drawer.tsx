import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/text';
import { ConversationList } from './conversation-list';
import { useUiStore } from '../../store/ui-store';

export type ChatDrawerProps = {
  open: boolean;
  onClose: () => void;
};

// 좌측 대화 목록 드로어 (ChatGPT/Claude 스타일)
export function ChatDrawer({ open, onClose }: ChatDrawerProps) {
  const insets = useSafeAreaInsets();
  const setScreen = useUiStore((s) => s.setScreen);

  const goMemories = () => {
    setScreen('memories');
    onClose();
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 flex-row bg-black/50" onPress={onClose}>
        <Pressable
          className="h-full w-[80%] max-w-[320px] border-r border-border bg-surface"
          style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text variant="subtitle" className="px-4 pb-2">
            나비스
          </Text>
          <ConversationList onAfterSelect={onClose} />

          <Pressable
            onPress={goMemories}
            className="mx-2 mb-1 flex-row items-center gap-2 rounded-xl border-t border-border px-3 py-3 active:bg-secondary"
          >
            <Text className="text-base">🧠</Text>
            <Text className="font-medium">내 기억</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
