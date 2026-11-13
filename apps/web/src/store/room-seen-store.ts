"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * 방마다 마지막으로 본 때(그 방의 updatedAt) — 사이드바의 '새 메시지' 점(2026-11-13).
 * 약속은 만든 방으로 오므로, 보고 있지 않은 방에 무언가 왔는지 알려야 한다.
 *
 * 이 기기에만 둔다(localStorage). 다른 기기에서 봤는지는 모른다 — 점 하나라 그 정도로 충분하다.
 * 저장소가 막힌 브라우저(사생활 보호 창)에서도 화면은 그대로 돈다 — 점이 새로고침마다 사라질 뿐이다.
 */
type RoomSeenStore = {
  seen: Record<string, string>;
  /** 이 방을 지금까지 봤다고 적는다. */
  markSeen: (id: string, updatedAt: string) => void;
  /** 처음 보는 방들은 지금 상태를 '본 것'으로 적는다 — 처음 열었을 때 모든 방에 점이 찍히지 않게. */
  adopt: (rooms: readonly { id: string; updatedAt: string }[]) => void;
};

const safeStorage = createJSONStorage(() => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
});

export const useRoomSeenStore = create<RoomSeenStore>()(
  persist(
    (set, get) => ({
      seen: {},
      markSeen: (id, updatedAt) => {
        if (get().seen[id] === updatedAt) return;
        set((s) => ({ seen: { ...s.seen, [id]: updatedAt } }));
      },
      adopt: (rooms) => {
        const missing = rooms.filter((r) => !(r.id in get().seen));
        if (!missing.length) return;
        set((s) => ({ seen: { ...s.seen, ...Object.fromEntries(missing.map((r) => [r.id, r.updatedAt])) } }));
      },
    }),
    { name: "navis-room-seen", storage: safeStorage },
  ),
);

/** 보고 있지 않은 방에 본 뒤로 새것이 왔는가. */
export const hasUnseen = (seen: Record<string, string>, room: { id: string; updatedAt: string }) => {
  const at = seen[room.id];
  return at !== undefined && room.updatedAt > at;
};
