import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/text';
import { ConversationList } from './conversation-list';

export type ChatDrawerProps = {
  open: boolean;
  onClose: () => void;
};

// 좌측 대화 목록 드로어 (ChatGPT/Claude 스타일)
export function ChatDrawer({ open, onClose }: ChatDrawerProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 flex-row bg-black/50" onPress={onClose}>
        <Pressable
          className="h-full w-[80%] max-w-[320px] border-r border-border bg-surface"
          style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text variant="subtitle" className="px-4 pb-2">
            대화
          </Text>
          <ConversationList onAfterSelect={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
