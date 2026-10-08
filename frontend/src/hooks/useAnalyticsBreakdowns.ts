import { useQuery } from '@tanstack/react-query';
import { apiV030, type AnalyticsQuery } from '@/lib/apiV030';
import { queryClient } from '@/lib/queryClient';
import { useEffectiveDayKey } from './useEffectiveDayKey';

export interface AnalyticsSlotProps {
  period: string;
  asOf?: string;
}

export function analyticsQuery({
  period,
  asOf,
}: AnalyticsSlotProps): AnalyticsQuery {
  return {
    period: (['7d', '30d', '3m', 'all'].includes(period)
      ? period
      : '7d') as AnalyticsQuery['period'],
    as_of: asOf,
  };
}

export function useAnalyticsBreakdowns(props: AnalyticsSlotProps) {
  const dayKey = useEffectiveDayKey();
  const query = analyticsQuery(props);
  return useQuery(
    {
      queryKey: ['analytics-breakdowns', query.period, dayKey, query.as_of],
      queryFn: () => apiV030.breakdowns(query),
    },
    queryClient
  );
}
