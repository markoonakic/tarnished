import { useQuery } from '@tanstack/react-query';
import { apiV030 } from '@/lib/apiV030';
export function useDashboardOverview() {
  return useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: apiV030.overview,
  });
}
