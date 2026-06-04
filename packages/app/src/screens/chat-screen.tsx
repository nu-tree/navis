import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatHeader, ChatInput, MessageList } from '../components/chat';

// 상태는 전부 Zustand 스토어 / TanStack Query 훅에서 → 화면은 레이아웃만
export function ChatScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ChatHeader title="나비스" subtitle="남운님의 개인 비서 · 온라인" />
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
    </View>
  );
}
