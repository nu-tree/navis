// 채팅 스토어 배럴(barrel) — 구현은 ./chat-store/ 하위 모듈로 분리되어 있고,
// 이 파일은 기존 공개 export(값/타입/훅)를 100% 동일한 이름으로 재export 한다.
// 외부 import 경로('../store/chat-store')는 한 줄도 바꾸지 않기 위함.
//
// 책임별 모듈:
//   ./chat-store/types.ts            공유 타입(Conversation, Report, ...)
//   ./chat-store/helpers.ts          순수 헬퍼·시드·상수
//   ./chat-store/persist.ts          zustand persist 설정
//   ./chat-store/store.ts            create + 초기 상태 + 슬라이스 결합
//   ./chat-store/slices/*            도메인 슬라이스(conversations/messages/typing/reports)
//   ./chat-store/selectors.ts        파생 셀렉터 훅
export { useChatStore } from './chat-store/store';
export {
  useActiveConversation,
  useIsActiveTyping,
  useChatModel,
  useTotalUnread,
  useTotalReportUnread,
} from './chat-store/selectors';
export type { ConversationKind, Conversation, ConversationSyncRow, Report } from './chat-store/types';
