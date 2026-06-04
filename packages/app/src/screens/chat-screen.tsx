import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatDrawer, ChatHeader, ChatInput, MessageList } from '../components/chat';
import { Text } from '../components/ui/text';
import { useActiveConversation, useChatStore } from '../store/chat-store';
import { useReports } from '../hooks/use-reports';

// 상태는 Zustand 스토어 / TanStack Query 훅에서 → 화면은 레이아웃 + 드로어 토글만
export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = useActiveConversation();
  const newConversation = useChatStore((s) => s.newConversation);

  // navis 선제 보고 폴링 → 보고방에 머지
  useReports();

  const isReport = active?.kind === 'report';

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ChatHeader
        title={active?.title ?? '나비스'}
        subtitle={isReport ? '보고 전용 · 읽기 전용' : '남운님의 개인 비서'}
        onMenu={() => setDrawerOpen(true)}
        onNewChat={() => newConversation()}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
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
      </KeyboardAvoidingView>

      <ChatDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}
