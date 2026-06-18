// 파생 셀렉터 훅 — 컴포넌트가 필요한 조각만 구독하도록 미리 만든 selector 들.
import type { Conversation } from './types';
import { useChatStore } from './store';

// 활성 대화방만 구독
export const useActiveConversation = (): Conversation | undefined =>
  useChatStore((s) => s.conversations.find((c) => c.id === s.activeId));

// 활성 방이 응답 생성 중인지
export const useIsActiveTyping = (): boolean =>
  useChatStore((s) => s.typingIds.includes(s.activeId));

// 현재 선택된 채팅 모델 — 모델 픽커가 구독
export const useChatModel = (): string => useChatStore((s) => s.model);

// 비활성 방들의 안 읽은 메시지 총합 — 헤더 메뉴(☰) 뱃지용
export const useTotalUnread = (): number =>
  useChatStore((s) => s.conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0));

// 보고방의 안 읽은 보고 총합 — "보고서" 탭 뱃지용
export const useTotalReportUnread = (): number =>
  useChatStore((s) =>
    s.conversations.reduce((sum, c) => (c.kind === 'report' ? sum + (c.unread ?? 0) : sum), 0),
  );
