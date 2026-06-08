import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeId } from '../lib/id';
import { DEFAULT_MODEL } from '../lib/models';
import type { ChatMessage } from '../types';

// 'code' = 데스크톱 로컬 에이전트(클로드 코드) 세션. 서버 동기화 대상이 아니라
// 이 기기에만 남는다(use-conversation-sync 는 'chat' 만 올림).
export type ConversationKind = 'chat' | 'report' | 'code';

export type Conversation = {
  id: string;
  title: string;
  kind: ConversationKind;
  messages: ChatMessage[];
  // 대화방마다 독립된 navis 세션 — 컨텍스트가 방끼리 섞이지 않는다.
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  // 카톡식 안 읽은 메시지 수 — 비활성 방에 navis 메시지/보고가 오면 +1, 방 열면 0.
  unread?: number;
  // 보고방 숨김 — 목록에서 가리되 데이터/크론은 유지(언제든 다시 보이게).
  hidden?: boolean;
  // 코드 세션(kind==='code') 전용: 이 세션의 작업 폴더(세션별) + 그 폴더의 namory
  // 프로젝트명(폴더명 폴백). 폴더를 고르면 그 레포의 기억이 연결되고 없으면 자동 생성된다.
  workdir?: string;
  project?: string;
  // 코드 세션의 현재 git 브랜치(폴더가 git 저장소일 때). 브랜치 칩에 표시.
  branch?: string;
};

// 서버 동기화로 내려오는 대화방 행(머지 입력). deletedAt 있으면 삭제 전파.
export type ConversationSyncRow = {
  id: string;
  title: string;
  kind: ConversationKind;
  messages: ChatMessage[];
  sessionId: string | null;
  unread: number;
  hidden: boolean;
  updatedAt: string;
  deletedAt: string | null;
};

// navis /api/reports 응답 항목
export type Report = {
  id: string;
  type: string;
  // 방 라우팅 키 (크론 id / "digest" / "calendar") + 방 제목(DB 기반)
  sourceId: string;
  sourceTitle: string;
  text: string;
  createdAt: string;
};

type ChatStore = {
  conversations: Conversation[]; // 최신이 앞
  activeId: string;
  typingIds: string[]; // 응답 생성 중인 대화방 id 목록 (방별 독립)
  typingStatus: Record<string, string>; // 대화방별 현재 도구 상태 텍스트
  typingStartedAt: Record<string, number>; // 대화방별 typing 시작 타임스탬프(ms)
  // 진행 중인 서버 스트림의 AbortController(방별). 중지 버튼이 이걸 abort 한다. 휘발성.
  aborters: Record<string, AbortController>;
  // 사용자가 고른 채팅 모델(클로드 데스크톱식). 전역 1개 — 모든 대화방에 적용되고
  // persist 로 유지된다. 일반 채팅(kind==='chat')에서만 의미 있다(코드 세션은
  // 로컬 에이전트, 보고방은 읽기 전용).
  model: string;
  setModel: (model: string) => void;
  newConversation: () => string;
  // 코드(로컬 에이전트) 세션 새로 만들기 — 빈 코드 세션이 이미 있으면 그걸로.
  newCodeSession: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  // 스트리밍: 기존 메시지 텍스트에 델타를 이어붙임(점진 표시)
  appendMessageText: (conversationId: string, messageId: string, delta: string) => void;
  // 스트리밍 종료 시 권위 있는 최종 텍스트로 보정
  setMessageText: (conversationId: string, messageId: string, text: string) => void;
  setMessageToolsUsed: (conversationId: string, messageId: string, tools: string[]) => void;
  // 스트리밍 중 도구 한 개씩 실시간 추가
  appendMessageTool: (conversationId: string, messageId: string, label: string) => void;
  // 스트리밍 중 생각 과정(확장 사고) 델타 이어붙임
  appendMessageThinking: (conversationId: string, messageId: string, delta: string) => void;
  // 중지 버튼: 진행 중 스트림을 abort + typing 해제. 코드 세션은 localAgent.stop 으로 별도.
  setAborter: (conversationId: string, controller?: AbortController) => void;
  stopGenerating: (conversationId: string) => void;
  setSessionId: (conversationId: string, sessionId?: string) => void;
  // 코드 세션의 작업 폴더 설정(+폴더 선택 시). 폴더가 바뀌면 namory 세션(sessionId)도
  // 끊어 새 폴더 맥락으로 다시 시작한다. 제목도 폴더/프로젝트명으로 갱신.
  setCodeFolder: (conversationId: string, workdir: string, project?: string) => void;
  // 코드 세션의 현재 브랜치 갱신(체크아웃 후 표시용).
  setCodeBranch: (conversationId: string, branch: string) => void;
  setTyping: (conversationId: string, typing: boolean) => void;
  setTypingStatus: (conversationId: string, tool: string) => void;
  // 메시지 이모지 리액션 토글 (있으면 제거, 없으면 추가)
  toggleReaction: (conversationId: string, messageId: string, emoji: string) => void;
  // 보고방을 보장(없으면 생성, 있으면 제목 갱신) — 크론 목록으로 미리 만들 때
  ensureReportRoom: (sourceId: string, title: string) => void;
  // navis 선제 보고를 출처(sourceId) 방에 추가(없으면 방 생성, 중복 id 무시)
  appendReport: (report: Report) => void;
  // 보고방 숨김/해제
  hideConversation: (id: string) => void;
  unhideConversation: (id: string) => void;
  // 같은 kind 안에서 보이는 방들의 새 순서(id 배열)로 재정렬 — 드래그앤드롭용
  reorderConversations: (kind: ConversationKind, orderedVisibleIds: string[]) => void;
  // 서버에서 받은 대화 스냅샷을 병합 — 방 단위 Last-Write-Wins(updatedAt) + 삭제 전파.
  mergeServerConversations: (rows: ConversationSyncRow[]) => void;
};

function now(): string {
  return new Date().toISOString();
}

function titleFromText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
}

function emptyConversation(): Conversation {
  const ts = now();
  return {
    id: makeId('c'),
    title: '새 대화',
    kind: 'chat',
    messages: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

// 시드: 첫 실행 시 보여줄 빈 대화방(저장된 대화가 있으면 persist 가 덮어쓴다).
// id 는 생성 id(`c_…`)·과거 카운터 id(`c0`)와 겹치지 않는 예약값으로 둔다 — 'c0' 면
// 서버에 남은 실제 대화 'c0' 의 툼스톤에 시드 방이 휩쓸려 사라질 수 있다.
// 하드코딩 ID 금지 — 서버 seed-chat 충돌 방지. 새 기기/초기화 시 고유 ID 생성.
function makeSeedChat(): Conversation {
  const ts = new Date().toISOString();
  return { id: makeId('c'), title: '나비스와의 대화', kind: 'chat', messages: [], createdAt: ts, updatedAt: ts };
}

// 보고방 id 규칙 — 출처(sourceId)별 방. 크론마다 방 1개(sourceId=크론 id).
const reportRoomId = (sourceId: string) => `report:${sourceId}`;

// 주간 다이제스트는 주기가 길어 비어 있어도 보이게 미리 시드. 크론·캘린더 방은
// 크론 목록(/api/crons)·첫 보고 도착 시 동적으로 생성된다.
const REPORT_DIGEST: Conversation = {
  id: reportRoomId('digest'),
  title: '📋 주간 다이제스트',
  kind: 'report',
  messages: [],
  createdAt: '2026-06-04T00:00:00.000Z',
  updatedAt: '2026-06-04T00:00:00.000Z',
};

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
  conversations: [makeSeedChat(), REPORT_DIGEST],
  activeId: '',
  typingIds: [],
  typingStatus: {},
  typingStartedAt: {},
  aborters: {},
  model: DEFAULT_MODEL,

  setModel: (model) => set({ model }),

  newConversation: () => {
    // 이미 비어 있는 새 대화 방이 있으면 또 만들지 않고 그 방으로 — 빈 방 쌓임 방지.
    const existing = get().conversations.find(
      (c) => c.kind === 'chat' && !c.hidden && c.messages.length === 0,
    );
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const conv = emptyConversation();
    set((s) => ({ conversations: [conv, ...s.conversations], activeId: conv.id }));
    return conv.id;
  },

  newCodeSession: () => {
    const existing = get().conversations.find(
      (c) => c.kind === 'code' && !c.hidden && c.messages.length === 0,
    );
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const ts = now();
    const conv: Conversation = {
      id: makeId('code'),
      title: '새 코드 세션',
      kind: 'code',
      messages: [],
      createdAt: ts,
      updatedAt: ts,
    };
    set((s) => ({ conversations: [conv, ...s.conversations], activeId: conv.id }));
    return conv.id;
  },

  selectConversation: (id) =>
    set((s) => ({
      activeId: id,
      // 방을 열면 읽음 처리
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    })),

  deleteConversation: (id) =>
    set((s) => {
      const remaining = s.conversations.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const fresh = emptyConversation();
        return { conversations: [fresh], activeId: fresh.id };
      }
      const activeId = s.activeId === id ? remaining[0].id : s.activeId;
      return { conversations: remaining, activeId };
    }),

  addMessage: (conversationId, message) =>
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const namingFromFirst = c.messages.length === 0 && message.role === 'user';
        // navis(assistant) 가 안 보고 있는 방에 보낸 메시지만 안 읽음으로 카운트
        const incoming = message.role === 'assistant' && s.activeId !== conversationId;
        return {
          ...c,
          messages: [...c.messages, message],
          title: namingFromFirst ? titleFromText(message.text) : c.title,
          unread: incoming ? (c.unread ?? 0) + 1 : c.unread,
          updatedAt: now(),
        };
      }),
    })),

  appendMessageText: (conversationId, messageId, delta) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, text: m.text + delta } : m,
              ),
            }
          : c,
      ),
    })),

  setMessageText: (conversationId, messageId, text) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) => (m.id === messageId ? { ...m, text } : m)),
            }
          : c,
      ),
    })),

  setMessageToolsUsed: (conversationId, messageId, tools) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, toolsUsed: tools } : m,
              ),
            }
          : c,
      ),
    })),

  appendMessageTool: (conversationId, messageId, label) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== messageId) return m;
                const existing = m.toolsUsed ?? [];
                if (existing.includes(label)) return m;
                return { ...m, toolsUsed: [...existing, label] };
              }),
            }
          : c,
      ),
    })),

  appendMessageThinking: (conversationId, messageId, delta) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, thinking: (m.thinking ?? '') + delta } : m,
              ),
            }
          : c,
      ),
    })),

  setAborter: (conversationId, controller) =>
    set((s) => {
      const aborters = { ...s.aborters };
      if (controller) aborters[conversationId] = controller;
      else delete aborters[conversationId];
      return { aborters };
    }),

  stopGenerating: (conversationId) => {
    const { aborters } = get();
    aborters[conversationId]?.abort();
    set((s) => {
      const next = { ...s.aborters };
      delete next[conversationId];
      return { aborters: next };
    });
    // typing 표시도 즉시 해제(스트림 catch 가 끝나기 전에 UI 반응).
    get().setTyping(conversationId, false);
  },

  setSessionId: (conversationId, sessionId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, sessionId } : c,
      ),
    })),

  setCodeFolder: (conversationId, workdir, project) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              workdir,
              project,
              // 폴더가 바뀌면 브랜치 표시도 초기화(새 폴더에서 다시 조회).
              branch: undefined,
              // 폴더가 바뀌면 이전 SDK 세션 맥락을 끊는다(새 폴더로 깨끗이 시작).
              sessionId: undefined,
              // 아직 빈 코드 세션이면 제목을 폴더/프로젝트명으로.
              title:
                c.messages.length === 0 ? (project || workdir.split('/').filter(Boolean).pop() || c.title) : c.title,
              updatedAt: now(),
            }
          : c,
      ),
    })),

  setCodeBranch: (conversationId, branch) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, branch, updatedAt: now() } : c,
      ),
    })),

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

  toggleReaction: (conversationId, messageId, emoji) =>
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== messageId) return m;
            const current = m.reactions ?? [];
            const reactions = current.includes(emoji)
              ? current.filter((e) => e !== emoji)
              : [...current, emoji];
            return { ...m, reactions };
          }),
        };
      }),
    })),

  ensureReportRoom: (sourceId, title) =>
    set((s) => {
      const id = reportRoomId(sourceId);
      const existing = s.conversations.find((c) => c.id === id);
      if (existing) {
        // 제목이 DB 에서 바뀌었으면 갱신
        if (existing.title === title) return s;
        return {
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
        };
      }
      const ts = now();
      const room: Conversation = {
        id,
        title,
        kind: 'report',
        messages: [],
        createdAt: ts,
        updatedAt: ts,
      };
      return { conversations: [...s.conversations, room] };
    }),

  hideConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, hidden: true, updatedAt: now() } : c,
      ),
    })),

  unhideConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, hidden: false, updatedAt: now() } : c,
      ),
    })),

  // 보이는(숨김 아닌) kind 슬롯을 새 순서로 채운다. 숨김·다른 kind 항목은 자리 유지.
  reorderConversations: (kind, orderedVisibleIds) =>
    set((s) => {
      const byId = new Map(s.conversations.map((c) => [c.id, c] as const));
      const next = orderedVisibleIds
        .map((id) => byId.get(id))
        .filter((c): c is Conversation => !!c && c.kind === kind && !c.hidden);
      if (next.length === 0) return s;
      let i = 0;
      return {
        conversations: s.conversations.map((c) =>
          c.kind === kind && !c.hidden ? next[i++] ?? c : c,
        ),
      };
    }),

  mergeServerConversations: (rows) =>
    set((s) => {
      let convs = [...s.conversations];
      for (const r of rows) {
        const idx = convs.findIndex((c) => c.id === r.id);
        if (r.deletedAt) {
          // 서버에서 삭제됨 → 로컬에서도 제거(전파)
          if (idx !== -1) convs.splice(idx, 1);
          continue;
        }
        const incoming: Conversation = {
          id: r.id,
          title: r.title,
          kind: r.kind,
          messages: r.messages ?? [],
          sessionId: r.sessionId ?? undefined,
          unread: r.unread,
          hidden: r.hidden,
          createdAt: idx !== -1 ? convs[idx].createdAt : r.updatedAt,
          updatedAt: r.updatedAt,
        };
        if (idx === -1) {
          // 로컬에 없던 방 → 추가(최신이 앞)
          convs.unshift(incoming);
        } else if (new Date(r.updatedAt) > new Date(convs[idx].updatedAt)) {
          // 서버가 더 최신 → 교체(LWW). 로컬이 더 최신이면 유지(다음 push 에서 올라감).
          convs[idx] = incoming;
        }
      }
      // 활성 방이 사라졌으면 첫 방으로
      const activeId = convs.some((c) => c.id === s.activeId)
        ? s.activeId
        : convs[0]?.id ?? s.activeId;
      return { conversations: convs, activeId };
    }),

  appendReport: (report) =>
    set((s) => {
      const id = reportRoomId(report.sourceId);
      const existing = s.conversations.find((c) => c.id === id);
      if (existing?.messages.some((m) => m.id === report.id)) return s; // 중복

      const message: ChatMessage = {
        id: report.id,
        role: 'assistant',
        text: report.text,
        createdAt: report.createdAt,
      };

      const isActive = s.activeId === id;

      // 방이 없으면 보고와 함께 생성 (새 방은 비활성 → 안 읽음 1)
      if (!existing) {
        const room: Conversation = {
          id,
          title: report.sourceTitle,
          kind: 'report',
          messages: [message],
          createdAt: report.createdAt,
          updatedAt: report.createdAt,
          unread: isActive ? 0 : 1,
        };
        return { conversations: [...s.conversations, room] };
      }

      return {
        conversations: s.conversations.map((c) =>
          c.id === id
            ? {
                ...c,
                messages: [...c.messages, message],
                updatedAt: report.createdAt,
                unread: isActive ? 0 : (c.unread ?? 0) + 1,
              }
            : c,
        ),
      };
    }),
    }),
    {
      name: 'navis-chat',
      storage: createJSONStorage(() => AsyncStorage),
      // 응답 생성 중 표시(typingIds)는 휘발성이라 저장하지 않는다.
      partialize: (s) => ({
        conversations: s.conversations,
        activeId: s.activeId,
        model: s.model,
      }),
      // 복원 후 activeId 가 비어있거나 목록에 없으면 첫 번째 대화로 보정.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const valid = state.conversations.some((c) => c.id === state.activeId);
        if (!valid) state.activeId = state.conversations[0]?.id ?? '';
      },
    },
  ),
);

// 파생 셀렉터 — 컴포넌트는 이걸로 활성 대화방만 구독
export const useActiveConversation = (): Conversation | undefined =>
  useChatStore((s) => s.conversations.find((c) => c.id === s.activeId));

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
