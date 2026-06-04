import { useQuery } from '@tanstack/react-query';
import { fetchCrons } from '../api/navis';
import { useChatStore } from '../store/chat-store';
import { IS_BACKEND_CONFIGURED } from '../lib/config';

// 크론 목록을 받아 크론마다 보고방을 미리 만든다(한눈에 보기). 활성 크론만.
// queryFn 안에서 직접 ensure(useEffect 회피) — 제목은 DB 기준으로 갱신된다.
export function useCrons() {
  useQuery({
    queryKey: ['crons'],
    enabled: IS_BACKEND_CONFIGURED,
    refetchInterval: 60_000,
    queryFn: async () => {
      const crons = await fetchCrons();
      const { ensureReportRoom } = useChatStore.getState();
      crons
        .filter((c) => c.enabled)
        .forEach((c) => ensureReportRoom(c.id, `⏰ ${c.title}`));
      return crons;
    },
  });
}
