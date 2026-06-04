import { useQuery } from '@tanstack/react-query';
import { fetchReports } from '../api/navis';
import { useChatStore } from '../store/chat-store';
import { IS_BACKEND_CONFIGURED } from '../lib/config';

// navis 선제 보고를 주기적으로 폴링해 보고방에 머지한다.
// queryFn 안에서 직접 머지(useEffect 회피) — appendReport 가 id 로 중복을 거른다.
export function useReports() {
  useQuery({
    queryKey: ['reports'],
    enabled: IS_BACKEND_CONFIGURED,
    refetchInterval: 30_000,
    queryFn: async () => {
      const reports = await fetchReports();
      const { appendReport } = useChatStore.getState();
      reports.forEach(appendReport);
      return reports;
    },
  });
}
