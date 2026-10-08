"use client";

import { create } from "zustand";
import type { ChatEvent } from "@navis/validation";

export type ChatErrorCode = NonNullable<Extract<ChatEvent, { type: "error" }>["code"]>;

// 방별 진행 중인 턴 — 서버 데이터가 아니라 화면 상태다. 서버 데이터(메시지)는 쿼리 캐시에 있다.
//
// ★ 패널 **밖**에 둔다. 패널은 방이 바뀔 때마다 key 로 통째로 갈아끼워진다
//   (components/layout/workspace.tsx). 턴 상태를 패널 안에 두면 방을 옮기는 순간 스트리밍
//   버퍼와 "진행 중" 표시가 사라지고, 돌아와도 질문만 보여 응답이 멈춘 것처럼 보였다
//   (2026-10-06 사용자 보고). 스토어는 전역이라 스트림은 패널과 무관하게 끝까지 쓰이고,
//   돌아온 패널은 같은 방을 다시 구독한다.
//
// 탭을 새로 고치면 이 상태도 사라진다. 그 경우 답은 서버에 저장되므로 방을 다시 열면 보인다.

export type ChatTurn = {
  /** 스트리밍 중인 답. null 이면 진행 중인 턴이 없다. ""는 "시작됐지만 첫 토큰 전". */
  streaming: string | null;
  tool: string | null;
  error: string | null;
  /** 오류의 종류. 토큰 오류면 화면이 설정 화면 링크를 붙인다(FR-056). */
  errorCode: ChatErrorCode | null;
  /** 중지에 쓴다. */
  turnId: string | null;
};

export const IDLE_TURN: ChatTurn = {
  streaming: null,
  tool: null,
  error: null,
  errorCode: null,
  turnId: null,
};

type ChatTurnStore = {
  turns: Record<string, ChatTurn>;
  update: (conversationId: string, patch: Partial<ChatTurn>) => void;
};

export const useChatTurnStore = create<ChatTurnStore>((set) => ({
  turns: {},
  update: (conversationId, patch) =>
    set(({ turns }) => {
      const next = { ...(turns[conversationId] ?? IDLE_TURN), ...patch };
      // 할 일이 없는 방은 지운다 — 방을 많이 오가도 쌓이지 않는다.
      if (next.streaming === null && next.error === null) {
        const rest = { ...turns };
        delete rest[conversationId];
        return { turns: rest };
      }
      return { turns: { ...turns, [conversationId]: next } };
    }),
}));

/** 이 방의 턴 상태. 없으면 같은 IDLE_TURN 객체를 돌려줘 불필요하게 다시 그리지 않는다. */
export const useChatTurn = (conversationId: string) =>
  useChatTurnStore((state) => state.turns[conversationId] ?? IDLE_TURN);

/** 렌더 밖(스트림 루프)에서 읽는다 — 구독하지 않는다. */
export const getChatTurn = (conversationId: string) =>
  useChatTurnStore.getState().turns[conversationId] ?? IDLE_TURN;
