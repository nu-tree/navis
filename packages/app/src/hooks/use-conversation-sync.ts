import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/chat-store';
import {
  fetchConversations,
  pushConversation,
  deleteConversationRemote,
} from '../api/conversations';
import { IS_BACKEND_CONFIGURED } from '../lib/config';

const PULL_INTERVAL_MS = 30_000;
const PUSH_DEBOUNCE_MS = 1500;

// 기기 간 대화 동기화 — 주기적 pull(머지) + 변경된 chat 방 디바운스 push.
// chat 방만 동기화(보고방은 서버 /api/reports 가 이미 양쪽에 내려줌).
// 빈 방(메시지 0)은 올리지 않아 노이즈를 줄인다.
export function useConversationSync(): void {
  const merge = useChatStore((s) => s.mergeServerConversations);
  // 마지막으로 올린 방의 updatedAt — 바뀐 것만 push.
  const lastPushed = useRef<Map<string, string>>(new Map());
  // 이전에 올린(존재했던) chat 방 id — 사라지면 삭제 전파.
  const knownIds = useRef<Set<string>>(new Set());

  // pull: 마운트 + 주기적
  useEffect(() => {
    if (!IS_BACKEND_CONFIGURED) return;
    let alive = true;
    const pull = async () => {
      try {
        const rows = await fetchConversations();
        if (alive) merge(rows);
      } catch {
        // 네트워크 실패는 조용히 무시(다음 주기에 재시도)
      }
    };
    void pull();
    const id = setInterval(pull, PULL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [merge]);

  // push: 스토어 변경 시 디바운스로 바뀐 chat 방만 업서트 + 삭제 전파
  useEffect(() => {
    if (!IS_BACKEND_CONFIGURED) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      const chats = useChatStore
        .getState()
        .conversations.filter((c) => c.kind === 'chat' && c.messages.length > 0);
      const nowIds = new Set(chats.map((c) => c.id));

      // 삭제 전파: 이전에 있던 id 가 사라졌으면 서버에서도 삭제
      for (const id of knownIds.current) {
        if (!nowIds.has(id)) {
          deleteConversationRemote(id).catch(() => {});
          lastPushed.current.delete(id);
        }
      }
      knownIds.current = nowIds;

      // 변경 업서트: updatedAt 이 마지막 push 와 다르면 올림
      for (const c of chats) {
        if (lastPushed.current.get(c.id) !== c.updatedAt) {
          pushConversation(c)
            .then(() => lastPushed.current.set(c.id, c.updatedAt))
            .catch(() => {});
        }
      }
    };

    const unsub = useChatStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, PUSH_DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);
}
