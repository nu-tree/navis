import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../ui/text';
import { ConversationList } from './conversation-list';
import { LocalAgentSheet } from '../local-agent-sheet';
import { useUiStore } from '../../store/ui-store';
import { useThemeStore } from '../../store/theme-store';
import { hasLocalAgent } from '../../lib/local-agent';

export type SidebarContentProps = {
  // 항목 선택/이동 후 호출 (모바일 드로어 닫기 등). 데스크톱 고정 사이드바에선 생략.
  onAfterSelect?: () => void;
  // 데스크톱 고정 사이드바에서 접기 버튼(‹) 표시. 모바일 드로어에선 생략.
  onCollapse?: () => void;
};

// 대화 목록 + "내 기억" 진입. 모바일 드로어와 데스크톱 고정 사이드바가 함께 쓴다.
export function SidebarContent({ onAfterSelect, onCollapse }: SidebarContentProps) {
  const setScreen = useUiStore((s) => s.setScreen);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const localMode = useUiStore((s) => s.localMode);
  const setLocalMode = useUiStore((s) => s.setLocalMode);
  const [localSheet, setLocalSheet] = useState(false);

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
          className="mx-2 flex-row items-center rounded-xl px-3 py-2.5 cursor-pointer transition-colors active:bg-secondary hover:bg-secondary"
        >
          <Text className="font-medium">프로젝트별 정리</Text>
        </Pressable>
        <Pressable
          onPress={toggleTheme}
          className="mx-2 flex-row items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer transition-colors active:bg-secondary hover:bg-secondary"
        >
          <Text className="font-medium">테마</Text>
          <Text variant="caption" className="text-muted-foreground">
            {theme === 'dark' ? '다크 › 라이트' : '라이트 › 다크'}
          </Text>
        </Pressable>

        {hasLocalAgent ? (
          <>
            <Pressable
              onPress={() => setLocalMode(!localMode)}
              className="mx-2 flex-row items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer transition-colors active:bg-secondary hover:bg-secondary"
            >
              <Text className="font-medium">로컬 모드</Text>
              <Text variant="caption" className={localMode ? 'text-primary' : 'text-muted-foreground'}>
                {localMode ? '내 맥에서 실행' : '서버 navis'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setLocalSheet(true)}
              className="mx-2 mb-1 flex-row items-center rounded-xl px-3 py-2.5 cursor-pointer transition-colors active:bg-secondary hover:bg-secondary"
            >
              <Text className="font-medium text-muted-foreground">로컬 에이전트 설정</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      <LocalAgentSheet open={localSheet} onClose={() => setLocalSheet(false)} />
    </>
  );
}
