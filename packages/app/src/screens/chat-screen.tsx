import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatDrawer, ChatHeader, ChatInput, MessageList } from '../components/chat';
import { useActiveConversation, useChatStore } from '../store/chat-store';

// 상태는 Zustand 스토어 / TanStack Query 훅에서 → 화면은 레이아웃 + 드로어 토글만
export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = useActiveConversation();
  const newConversation = useChatStore((s) => s.newConversation);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ChatHeader
        title={active?.title ?? '나비스'}
        subtitle="남운님의 개인 비서"
        onMenu={() => setDrawerOpen(true)}
        onNewChat={() => newConversation()}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <MessageList />
        <View style={{ paddingBottom: insets.bottom }}>
          <ChatInput />
        </View>
      </KeyboardAvoidingView>

      <ChatDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}
