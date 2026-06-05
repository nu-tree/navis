import { Pressable, View } from 'react-native';
import { Text } from '../ui/text';
import { ConversationList } from './conversation-list';
import { useUiStore } from '../../store/ui-store';

export type SidebarContentProps = {
  // 항목 선택/이동 후 호출 (모바일 드로어 닫기 등). 데스크톱 고정 사이드바에선 생략.
  onAfterSelect?: () => void;
  // 데스크톱 고정 사이드바에서 접기 버튼(‹) 표시. 모바일 드로어에선 생략.
  onCollapse?: () => void;
};

// 대화 목록 + "내 기억" 진입. 모바일 드로어와 데스크톱 고정 사이드바가 함께 쓴다.
export function SidebarContent({ onAfterSelect, onCollapse }: SidebarContentProps) {
  const setScreen = useUiStore((s) => s.setScreen);

  const goMemories = () => {
    setScreen('memories');
    onAfterSelect?.();
  };

  return (
    <>
      <View className="flex-row items-center justify-between px-4 pb-2">
        <Text variant="subtitle">나비스</Text>
        {onCollapse ? (
          <Pressable
            hitSlop={8}
            onPress={onCollapse}
            className="h-8 w-8 items-center justify-center rounded-lg active:bg-secondary"
          >
            <Text className="text-lg text-muted-foreground">‹</Text>
          </Pressable>
        ) : null}
      </View>
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
