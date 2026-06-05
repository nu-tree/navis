import { useQuery } from '@tanstack/react-query';
import { fetchReports } from '../api/navis';
import { useChatStore } from '../store/chat-store';
import { useUiStore } from '../store/ui-store';
import { IS_BACKEND_CONFIGURED } from '../lib/config';
import { notify, isWindowHidden } from '../lib/notify';

// 보고방 id 규칙(store 와 동일) — 알림 클릭 시 해당 방으로 이동하기 위해.
const reportRoomId = (sourceId: string) => `report:${sourceId}`;

// 첫 폴링에서 기존 보고 전부를 새 알림으로 쏘지 않도록 prime.
let primed = false;

// navis 선제 보고를 주기적으로 폴링해 보고방에 머지한다.
// queryFn 안에서 직접 머지(useEffect 회피) — appendReport 가 id 로 중복을 거른다.
// 새로 도착한 보고는 데스크톱/웹에서 네이티브 알림으로 띄운다(나비스가 먼저 말 거는 경우).
export function useReports() {
  useQuery({
    queryKey: ['reports'],
    enabled: IS_BACKEND_CONFIGURED,
    refetchInterval: 30_000,
    queryFn: async () => {
      const reports = await fetchReports();
      const store = useChatStore.getState();
      const isExisting = (id: string) =>
        store.conversations.some((c) => c.messages.some((m) => m.id === id));

      for (const r of reports) {
        const isNew = !isExisting(r.id);
        store.appendReport(r);
        if (!isNew || !primed) continue;

        // 포그라운드에서 이미 그 방을 보고 있으면 알림 생략.
        const roomId = reportRoomId(r.sourceId);
        const watching = !isWindowHidden() && useChatStore.getState().activeId === roomId;
        if (watching) continue;

        notify(r.sourceTitle || '나비스', r.text.replace(/\s+/g, ' ').slice(0, 140), () => {
          useUiStore.getState().setScreen('chat');
          useChatStore.getState().selectConversation(roomId);
        });
      }

      primed = true;
      return reports;
    },
  });
}
