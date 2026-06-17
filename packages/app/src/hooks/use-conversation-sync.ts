import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useChatStore } from '../store/chat-store';
import {
  fetchConversations,
  pushConversation,
  deleteConversationRemote,
} from '../api/conversations';
import { handoffChat } from '../api/navis';
import { IS_BACKEND_CONFIGURED } from '../lib/config';

const PULL_INTERVAL_MS = 30_000;
const PUSH_DEBOUNCE_MS = 1500;

// 일시적 실패(콜드스타트 아닌 순간 502·네트워크 블립)에 약한 재시도. 동기화는
// 조용히 한 번 실패하면 다음 트리거까지 어긋난 채로 남으므로, 짧게 몇 번 재시도해
// 체감 신뢰성을 올린다. 점증 백오프(0.6s → 1.2s).
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, i * 600));
    }
  }
  throw lastErr;
}

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
        const rows = await withRetry(() => fetchConversations());
        if (alive) merge(rows);
      } catch {
        // 재시도까지 실패하면 조용히 무시(다음 주기에 재시도)
      }
    };
    void pull();
    const id = setInterval(pull, PULL_INTERVAL_MS);
    // 포그라운드 복귀 직후엔 백그라운드 완주 답이 막 영속됐을 수 있다. 서버 조회가
    // 경합으로 한 번 실패/지연돼도 놓치지 않게 짧게 몇 번 더 당겨온다(단발 pull 보강).
    let burstTimers: ReturnType<typeof setTimeout>[] = [];
    const burstPull = () => {
      for (const t of burstTimers) clearTimeout(t); // 직전 버스트의 미발화 타이머 정리(누적 방지)
      void pull();
      burstTimers = [
        setTimeout(() => void pull(), 3000),
        setTimeout(() => void pull(), 8000),
      ];
    };
    // 앱이 백그라운드에서 다시 활성화되면(foreground 복귀) 즉시 한 번 pull 한다.
    // 폰을 잠그거나 앱을 나간 사이 서버가 백그라운드로 완주·저장한 답변을, 다음 30초
    // 주기를 기다리지 않고 곧바로 받아와 부분 답변("멈춤") 상태를 빠르게 해소한다.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        burstPull();
      } else if (state === 'background') {
        // 앱이 백그라운드로 감(홈/앱전환/잠금) → 진행 중인 모든 턴을 서버에 핸드오프한다.
        // 이러면 연결 끊김 감지(clientGone)에 의존하지 않고도 서버가 응답을 끝까지
        // 만들어 영속 + 폰 푸시한다 → 복귀 시 위 'active' pull 로 답이 내려온다.
        const turns = useChatStore.getState().inflightTurns;
        for (const turnId of Object.values(turns)) void handoffChat(turnId);
      }
    });
    return () => {
      alive = false;
      clearInterval(id);
      for (const t of burstTimers) clearTimeout(t);
      appStateSub.remove();
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

      // 삭제 전파: 이전에 있던 id 가 사라졌으면 서버에서도 삭제.
      // 성공해야 known 에서 빼므로, 실패하면 다음 flush 에서 재시도된다(유실 방지).
      for (const id of [...knownIds.current]) {
        if (!nowIds.has(id)) {
          withRetry(() => deleteConversationRemote(id))
            .then(() => {
              knownIds.current.delete(id);
              lastPushed.current.delete(id);
            })
            .catch(() => {
              // 재시도까지 실패 → known 에 남겨 다음 주기에 다시 삭제 시도
            });
        }
      }
      // 살아있는 방은 known 에 보강(삭제 검출 기준). 삭제 성공 전까진 위에서 유지.
      for (const id of nowIds) knownIds.current.add(id);

      // 변경 업서트: updatedAt 이 마지막 push 와 다르면 올림(재시도 포함)
      for (const c of chats) {
        if (lastPushed.current.get(c.id) !== c.updatedAt) {
          withRetry(() => pushConversation(c))
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
