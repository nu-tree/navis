// 보고 슬라이스 — navis 선제 보고를 출처(sourceId)별 보고방에 보장/추가한다.
// 비활성 방이면 안 읽음 카운트를 올린다.
import type { StateCreator } from 'zustand';
import type { ChatMessage } from '../../../types';
import type { ChatStore, Conversation } from '../types';
import { now, reportRoomId } from '../helpers';

export type ReportsSlice = Pick<ChatStore, 'ensureReportRoom' | 'appendReport'>;

export const createReportsSlice: StateCreator<ChatStore, [], [], ReportsSlice> = (set) => ({
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
});
