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

  const go = (screen: 'memories' | 'projects') => () => {
    setScreen(screen);
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
            className="h-8 w-8 items-center justify-center rounded-lg cursor-pointer active:bg-secondary hover:bg-secondary"
          >
            <Text className="text-lg text-muted-foreground">‹</Text>
          </Pressable>
        ) : null}
      </View>
      <ConversationList onAfterSelect={onAfterSelect} />

      <View className="border-t border-border pt-1">
        <Pressable
          onPress={go('memories')}
          className="mx-2 flex-row items-center rounded-xl px-3 py-2.5 cursor-pointer transition-colors active:bg-secondary hover:bg-secondary"
        >
          <Text className="font-medium">내 기억</Text>
        </Pressable>
        <Pressable
          onPress={go('projects')}
          className="mx-2 mb-1 flex-row items-center rounded-xl px-3 py-2.5 cursor-pointer transition-colors active:bg-secondary hover:bg-secondary"
        >
          <Text className="font-medium">프로젝트별 정리</Text>
        </Pressable>
      </View>
    </>
  );
}
