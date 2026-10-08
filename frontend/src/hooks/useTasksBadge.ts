import { useQuery } from '@tanstack/react-query';
import { apiV030 } from '@/lib/apiV030';
import { queryClient } from '@/lib/queryClient';
export function useTasksBadge(): { count: number; overdue: boolean } {
  const { data } = useQuery(
    {
      queryKey: ['tasks-badge'],
      queryFn: () => apiV030.tasks({ per_page: 1 }),
      refetchInterval: 60_000,
    },
    queryClient
  );
  return {
    count: data?.badge.total ?? 0,
    overdue: (data?.badge.overdue ?? 0) > 0,
  };
}
