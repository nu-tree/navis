import { Pressable } from 'react-native';
import { Text } from '../ui/text';
import { ConversationList } from './conversation-list';
import { useUiStore } from '../../store/ui-store';

export type SidebarContentProps = {
  // 항목 선택/이동 후 호출 (모바일 드로어 닫기 등). 데스크톱 고정 사이드바에선 생략.
  onAfterSelect?: () => void;
};

// 대화 목록 + "내 기억" 진입. 모바일 드로어와 데스크톱 고정 사이드바가 함께 쓴다.
export function SidebarContent({ onAfterSelect }: SidebarContentProps) {
  const setScreen = useUiStore((s) => s.setScreen);

  const goMemories = () => {
    setScreen('memories');
    onAfterSelect?.();
  };

  return (
    <>
      <Text variant="subtitle" className="px-4 pb-2">
        나비스
      </Text>
      <ConversationList onAfterSelect={onAfterSelect} />

      <Pressable
        onPress={goMemories}
        className="mx-2 mb-1 flex-row items-center gap-2 rounded-xl border-t border-border px-3 py-3 active:bg-secondary"
      >
        <Text className="text-base">🧠</Text>
        <Text className="font-medium">내 기억</Text>
      </Pressable>
    </>
  );
}
