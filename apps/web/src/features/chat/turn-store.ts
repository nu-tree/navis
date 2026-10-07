"use client";

import type { Message } from "@navis/validation";

// 방별 진행 중인 턴 — 채팅 패널 **밖**에 둔다.
//
// ★ 패널은 방이 바뀔 때마다 key 로 통째로 갈아끼워진다(app/page.tsx). 턴 상태를 패널
//   안에 두면 방을 옮기는 순간 스트리밍 버퍼와 "진행 중" 표시가 사라지고, 돌아와도 질문만
//   보여 응답이 멈춘 것처럼 보였다(2026-10-06 사용자 보고). 서버는 그동안 계속 생성하고
//   저장한다 — 잃는 것은 화면 쪽 상태뿐이었다.
//   여기 두면 스트림은 패널과 무관하게 끝까지 읽히고, 돌아온 패널은 같은 상태를 다시 구독한다.
//
// 탭을 새로 고치면 이 상태도 사라진다. 그 경우 답은 서버에 저장되므로 방을 다시 열면 보인다.

export type TurnState = {
  /** 스트리밍 중인 답. null 이면 진행 중인 턴이 없다. ""는 "시작됐지만 첫 토큰 전". */
  streaming: string | null;
  tool: string | null;
  error: string | null;
  /** 중지에 쓴다. */
  turnId: string | null;
};

const IDLE: TurnState = { streaming: null, tool: null, error: null, turnId: null };

const turns = new Map<string, TurnState>();
const listeners = new Set<() => void>();
// 지금 화면에 열린 방의 메시지 목록에 덧붙이는 함수. 열려 있지 않은 방이면 없다.
const appenders = new Map<string, (messages: Message[]) => void>();

const emit = () => listeners.forEach((l) => l());

export const turnStore = {
  /** useSyncExternalStore 용. 바뀌지 않았으면 같은 객체를 돌려줘야 한다. */
  get: (conversationId: string): TurnState => turns.get(conversationId) ?? IDLE,

  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  update: (conversationId: string, patch: Partial<TurnState>) => {
    const next = { ...turnStore.get(conversationId), ...patch };
    // 할 일이 없는 방은 지운다 — 방을 많이 오가도 맵이 자라지 않는다.
    if (next.streaming === null && next.error === null) turns.delete(conversationId);
    else turns.set(conversationId, next);
    emit();
  },

  /**
   * 열린 방이 메시지를 받을 통로를 등록한다. 패널이 마운트돼 있는 동안만 유효하다.
   *
   * 방을 떠난 사이 끝난 턴의 답은 여기로 오지 않는다 — 서버에 저장됐으므로 방을 다시
   * 열 때 목록 조회가 가져온다. 중지된 부분 답(서버에 기록되지 않는다, FR-004)은
   * 그때 사라진다. 방에 있었을 때와 같은 규칙이다.
   */
  attach: (conversationId: string, append: (messages: Message[]) => void) => {
    appenders.set(conversationId, append);
    return () => {
      if (appenders.get(conversationId) === append) appenders.delete(conversationId);
    };
  },

  deliver: (conversationId: string, messages: Message[]) => {
    appenders.get(conversationId)?.(messages);
  },
};
