import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatDrawer, ChatHeader, ChatInput, MessageList } from '../components/chat';
import { SidebarContent } from '../components/chat/sidebar-content';
import { Text } from '../components/ui/text';
import { useActiveConversation, useChatStore, useTotalUnread } from '../store/chat-store';
import { useUiStore } from '../store/ui-store';
import { useReports } from '../hooks/use-reports';
import { useCrons } from '../hooks/use-crons';
import { ensureNotifyPermission } from '../lib/notify';

// 데스크톱/태블릿 폭 기준 — 이 이상이면 드로어 대신 고정 사이드바 + 중앙 채팅 칼럼.
const WIDE_BREAKPOINT = 900;
// 넓은 화면에서 채팅 본문이 과도하게 늘어나지 않게 가독 폭 상한(Claude 데스크톱 느낌).
const CHAT_MAX_WIDTH = 900;

// 상태는 Zustand 스토어 / TanStack Query 훅에서 → 화면은 레이아웃 + 드로어 토글만
export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = useActiveConversation();
  const totalUnread = useTotalUnread();
  const newConversation = useChatStore((s) => s.newConversation);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  // 데스크톱 고정 사이드바는 접지 않았을 때만. 접으면 헤더 ☰ 로 다시 펼친다.
  const showSidebar = isWide && !sidebarCollapsed;

  // navis 선제 보고 폴링 → 보고방에 머지 + 크론 목록으로 보고방 미리 생성
  useReports();
  useCrons();

  // 데스크톱/웹 알림 권한 요청(1회). 네이티브 모바일에선 no-op.
  useEffect(() => {
    ensureNotifyPermission();
  }, []);

  const isReport = active?.kind === 'report';

  return (
    <View className="flex-1 flex-row" style={{ paddingTop: insets.top }}>
      {/* 데스크톱: 고정 사이드바 (접기 가능) */}
      {showSidebar ? (
        <View className="w-[300px] border-r border-border bg-surface">
          <SidebarContent onCollapse={() => setSidebarCollapsed(true)} />
        </View>
      ) : null}

      <View className="flex-1">
        <ChatHeader
          title={active?.title ?? '나비스'}
          subtitle={isReport ? '보고 전용 · 읽기 전용' : '남운님의 개인 비서'}
          // 넓은 화면에선 ☰ 로 접힌 사이드바를 펼치고, 모바일에선 드로어를 연다.
          onMenu={() => (isWide ? setSidebarCollapsed(false) : setDrawerOpen(true))}
          onNewChat={() => newConversation()}
          unread={totalUnread}
          showMenu={!showSidebar}
        />
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top}
        >
          {/* 넓은 화면에선 본문을 가운데 정렬하고 폭을 제한 */}
          <View className="w-full flex-1 self-center" style={{ maxWidth: CHAT_MAX_WIDTH }}>
            <MessageList />
            {isReport ? (
              <View
                className="border-t border-border bg-background px-4 py-3"
                style={{ paddingBottom: insets.bottom + 12 }}
              >
                <Text variant="caption" className="text-center text-muted-foreground">
                  나비스가 보내는 보고가 모이는 방이야 · 여기선 답장하지 않아도 돼
                </Text>
              </View>
            ) : (
              <View style={{ paddingBottom: insets.bottom }}>
                <ChatInput />
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* 모바일: 드로어 (넓은 화면에선 고정 사이드바라 불필요) */}
      {isWide ? null : <ChatDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
    </View>
  );
}
