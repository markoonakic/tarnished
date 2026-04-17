import { useQuery } from '@tanstack/react-query';

import { getDashboardKPIs, getNeedsAttention } from '@/lib/dashboard';
import { useEffectiveDayKey } from '@/hooks/useEffectiveDayKey';

export function useDashboardKPIs() {
  const dayKey = useEffectiveDayKey();

  return useQuery({
    queryKey: ['dashboard-kpis', dayKey],
    queryFn: getDashboardKPIs,
    staleTime: 0,
  });
}

export function useNeedsAttentionData() {
  const dayKey = useEffectiveDayKey();

  return useQuery({
    queryKey: ['dashboard-needs-attention', dayKey],
    queryFn: getNeedsAttention,
    staleTime: 0,
  });
}
