import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchMemories,
  patchMemory,
  deleteMemory,
  type MemoryPatch,
} from '../api/navis';
import { IS_BACKEND_CONFIGURED } from '../lib/config';

export function useMemories() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['memories'],
    queryFn: fetchMemories,
    enabled: IS_BACKEND_CONFIGURED,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['memories'] });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    onSuccess: invalidate,
  });

  const patch = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MemoryPatch }) => patchMemory(id, patch),
    onSuccess: invalidate,
  });

  return {
    memories: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
    remove,
    patch,
  };
}
