import { Pressable, View } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from '../ui/text';
import { ConversationList } from './conversation-list';
import { useUiStore, type ChatTab } from '../../store/ui-store';
import { useChatStore, useTotalReportUnread } from '../../store/chat-store';
import { hasLocalAgent } from '../../lib/local-agent';

export type SidebarContentProps = {
  // 항목 선택/이동 후 호출 (모바일 드로어 닫기 등). 데스크톱 고정 사이드바에선 생략.
  onAfterSelect?: () => void;
  // 데스크톱 고정 사이드바에서 접기 버튼(‹) 표시. 모바일 드로어에선 생략.
  onCollapse?: () => void;
};

// 클로드 데스크톱식 상단 탭(채팅 / 보고서). 누르면 사이드바 목록과 본문이 함께 바뀐다.
function TabBar() {
  const chatTab = useUiStore((s) => s.chatTab);
  const setChatTab = useUiStore((s) => s.setChatTab);
  const reportUnread = useTotalReportUnread();

  // 탭을 바꾸면 본문도 따라가도록 그 탭의 첫 방을 연다(현재 방 종류가 다를 때만).
  const switchTab = (tab: ChatTab) => {
    if (tab === chatTab) return;
    setChatTab(tab);
    const { conversations, activeId, selectConversation, newCodeSession } =
      useChatStore.getState();
    const active = conversations.find((c) => c.id === activeId);
    if (active?.kind === tab) return;
    const first = conversations.find((c) => c.kind === tab && !c.hidden);
    if (first) selectConversation(first.id);
    // 코드 탭에 세션이 하나도 없으면 빈 세션을 만들어 바로 시작할 수 있게.
    else if (tab === 'code') newCodeSession();
  };

  const tabs: { key: ChatTab; label: string; badge?: number }[] = [
    { key: 'chat', label: '채팅' },
    { key: 'report', label: '보고서', badge: reportUnread },
    // 코드 탭은 데스크톱(로컬 에이전트 가용)에서만 노출.
    ...(hasLocalAgent ? [{ key: 'code' as ChatTab, label: '코드' }] : []),
  ];

  return (
    <View className="mx-3 mb-2 flex-row gap-1 rounded-xl bg-muted p-1">
      {tabs.map((t) => {
        const active = chatTab === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => switchTab(t.key)}
            className={cn(
              'flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-1.5 cursor-pointer transition-colors',
              active ? 'bg-background' : 'hover:bg-secondary',
            )}
          >
            <Text className={cn('text-sm', active ? 'font-semibold' : 'text-muted-foreground')}>
              {t.label}
            </Text>
            {t.badge ? (
              <View className="min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 py-0.5">
                <Text className="text-[10px] font-bold text-destructive-foreground">
                  {t.badge > 99 ? '99+' : t.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// 대화 목록 + "내 기억"·"설정" 진입. 모바일 드로어와 데스크톱 고정 사이드바가 함께 쓴다.
export function SidebarContent({ onAfterSelect, onCollapse }: SidebarContentProps) {
  const setScreen = useUiStore((s) => s.setScreen);
  const localMode = useUiStore((s) => s.localMode);
  const setLocalMode = useUiStore((s) => s.setLocalMode);

  const go = (screen: 'memories' | 'projects' | 'settings') => () => {
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
      <TabBar />
      <ConversationList onAfterSelect={onAfterSelect} />

      <View className="border-t border-border pt-1">
        {/* '내 기억'·'프로젝트별 정리' 는 설정 화면 안으로 옮겼다(사이드바 간소화). */}
        {hasLocalAgent ? (
          <Pressable
            onPress={() => setLocalMode(!localMode)}
            className="mx-2 flex-row items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer transition-colors active:bg-secondary hover:bg-secondary"
          >
            <Text className="font-medium">로컬 모드</Text>
            <Text variant="caption" className={localMode ? 'text-primary' : 'text-muted-foreground'}>
              {localMode ? '내 맥에서 실행' : '서버 navis'}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={go('settings')}
          className="mx-2 mb-1 flex-row items-center rounded-xl px-3 py-2.5 cursor-pointer transition-colors active:bg-secondary hover:bg-secondary"
        >
          <Text className="font-medium">설정</Text>
        </Pressable>
      </View>
    </>
  );
}
