import { useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { ChatBubble } from './chat-bubble';
import { TypingIndicator } from './typing-indicator';
import { Text } from '../ui/text';
import { useActiveConversation, useIsActiveTyping, useChatStore } from '../../store/chat-store';
import type { ChatMessage } from '../../types';

// inverted 기준 "맨 아래(최신)" 판정 여유 — 이 픽셀 이내면 바닥에 붙어있는 것으로 본다.
const AT_BOTTOM_THRESHOLD = 60;

// 활성 대화방의 메시지를 직접 구독 (props 없음)
export function MessageList() {
  const conversation = useActiveConversation();
  const typing = useIsActiveTyping();
  const messages = conversation?.messages ?? [];
  // 지금 스트리밍 중인 응답 말풍선 id — 그 말풍선만 작업/생각 블록을 자동으로 펼친다.
  // index 추정 대신 정확한 id 매칭이라, 직전 답변이 잠깐 펼쳐지는 깜빡임이 없다.
  const streamingId = useChatStore((s) => (conversation ? s.streamingId[conversation.id] : undefined));

  // inverted 리스트 — 최신 메시지가 스크롤 오프셋 0(=화면 맨 아래)에 오도록 역순으로 둔다.
  // 새 메시지(내 질문)·스트리밍 답변은 항상 data[0] 라 자동으로 맨 아래에 붙고, 끝으로
  // 보낼 때도 offset 0 으로 정확히 고정돼 가변 높이 언더슈트(직전 답변에 멈춤)가 없다.
  const data = useMemo(() => [...messages].reverse(), [messages]);

  const ref = useRef<FlatList<ChatMessage>>(null);
  // 사용자가 위로 올려 과거를 읽는 중인지 추적. 바닥 근처(offset≈0)일 때만 새 콘텐츠를
  // 따라 내려가고, 위에서 읽는 중이면 스트리밍 답변이 와도 건드리지 않는다.
  const atBottom = useRef(true);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    atBottom.current = e.nativeEvent.contentOffset.y <= AT_BOTTOM_THRESHOLD;
  };
  // 방을 전환하면 항상 최신(바닥)에서 시작 — 이전 방에서 위로 올려둔 상태가 남아
  // 새 방의 스트리밍을 안 따라가는 일이 없도록 "따라가기"로 리셋한다.
  useEffect(() => {
    atBottom.current = true;
  }, [conversation?.id]);

  return (
    <FlatList
      ref={ref}
      data={data}
      keyExtractor={(m) => m.id}
      inverted
      onScroll={onScroll}
      scrollEventThrottle={16}
      // streamingId 가 바뀌면 해당 말풍선이 자동 펼침/접힘 되도록 재렌더 강제.
      extraData={streamingId}
      renderItem={({ item }) => (
        <ChatBubble message={item} streaming={item.id === streamingId} />
      )}
      contentContainerStyle={{
        paddingHorizontal: 12,
        paddingVertical: 16,
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
      // 콘텐츠가 늘어날 때(새 메시지/스트리밍 토큰) 바닥 근처면 최신(offset 0)으로 따라간다.
      // 위로 올려 읽는 중(atBottom=false)이면 스크롤을 건드리지 않아 답변이 와도 안 끌려간다.
      onContentSizeChange={() => {
        if (atBottom.current) ref.current?.scrollToOffset({ offset: 0, animated: false });
      }}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center">
          <Text variant="muted">
            {conversation?.kind === 'report' ? '아직 받은 보고가 없어' : '새 대화를 시작해봐'}
          </Text>
        </View>
      }
      // inverted 에서 Header 는 시각적으로 맨 아래(최신 메시지 밑)에 렌더된다 →
      // 타이핑 인디케이터를 여기 둔다(예전 ListFooterComponent 위치).
      ListHeaderComponent={
        typing ? (
          <View className="px-1">
            <TypingIndicator />
          </View>
        ) : null
      }
    />
  );
}
