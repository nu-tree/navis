// 타이핑/스트리밍 슬라이스 — 응답 생성 표시(typing), 도구 상태, 스트리밍 말풍선 id,
// 진행 중 스트림의 abort/cancel/turnId 등록과 중지(stopGenerating)를 담당한다.
// 이 상태들은 모두 휘발성(persist 제외).
import type { StateCreator } from 'zustand';
import type { ChatStore } from '../types';

export type TypingSlice = Pick<
  ChatStore,
  | 'setAborter'
  | 'setCanceler'
  | 'setInflightTurn'
  | 'stopGenerating'
  | 'setTyping'
  | 'setTypingStatus'
  | 'setStreamingId'
>;

export const createTypingSlice: StateCreator<ChatStore, [], [], TypingSlice> = (set, get) => ({
  setAborter: (conversationId, controller) =>
    set((s) => {
      const aborters = { ...s.aborters };
      if (controller) aborters[conversationId] = controller;
      else delete aborters[conversationId];
      return { aborters };
    }),

  setCanceler: (conversationId, cancel) =>
    set((s) => {
      const cancelers = { ...s.cancelers };
      if (cancel) cancelers[conversationId] = cancel;
      else delete cancelers[conversationId];
      return { cancelers };
    }),

  setInflightTurn: (conversationId, turnId) =>
    set((s) => {
      const inflightTurns = { ...s.inflightTurns };
      if (turnId) inflightTurns[conversationId] = turnId;
      else delete inflightTurns[conversationId];
      return { inflightTurns };
    }),

  stopGenerating: (conversationId) => {
    const { aborters, cancelers } = get();
    // 서버에 명시적 취소(turnId) — 이게 없으면 서버는 연결 종료를 "백그라운드로 떠남"
    // 으로 보고 생성을 계속한다. 중지는 의도적이므로 서버 생성도 끊어 토큰을 아낀다.
    cancelers[conversationId]?.();
    aborters[conversationId]?.abort();
    set((s) => {
      const nextAborters = { ...s.aborters };
      const nextCancelers = { ...s.cancelers };
      delete nextAborters[conversationId];
      delete nextCancelers[conversationId];
      return { aborters: nextAborters, cancelers: nextCancelers };
    });
    // typing 표시도 즉시 해제(스트림 catch 가 끝나기 전에 UI 반응).
    get().setTyping(conversationId, false);
  },

  setTyping: (conversationId, typing) =>
    set((s) => {
      const ids = typing
        ? Array.from(new Set([...s.typingIds, conversationId]))
        : s.typingIds.filter((x) => x !== conversationId);
      const startedAt = { ...s.typingStartedAt };
      const status = { ...s.typingStatus };
      if (typing) {
        startedAt[conversationId] = Date.now();
        status[conversationId] = '';
      } else {
        delete startedAt[conversationId];
        delete status[conversationId];
      }
      return { typingIds: ids, typingStartedAt: startedAt, typingStatus: status };
    }),

  setTypingStatus: (conversationId, tool) =>
    set((s) => ({
      typingStatus: { ...s.typingStatus, [conversationId]: tool },
    })),

  setStreamingId: (conversationId, messageId) =>
    set((s) => ({
      streamingId: { ...s.streamingId, [conversationId]: messageId },
    })),
});
