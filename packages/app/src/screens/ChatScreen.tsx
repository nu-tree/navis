import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatHeader, ChatInput, MessageList } from '../components/chat';
import { MOCK_MESSAGES } from '../data/mockMessages';
import type { ChatMessage } from '../types';

let nextId = 1000;

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [typing, setTyping] = useState(false);

  const handleSend = (text: string) => {
    const userMsg: ChatMessage = {
      id: `u${nextId++}`,
      role: 'user',
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 목업: 백엔드 연결 전 임시 응답
    setTyping(true);
    setTimeout(() => {
      const reply: ChatMessage = {
        id: `a${nextId++}`,
        role: 'assistant',
        text: '(목업) 아직 백엔드 연결 전이라 임시 응답이야. 곧 진짜 navis가 답할게.',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
      setTyping(false);
    }, 800);
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ChatHeader title="navis" subtitle="제2의 뇌 · 온라인" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <MessageList messages={messages} typing={typing} />
        <View style={{ paddingBottom: insets.bottom }}>
          <ChatInput onSend={handleSend} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
