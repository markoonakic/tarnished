import { useQuery } from '@tanstack/react-query';

import {
  getAnalyticsKPIs,
  getHeatmapData,
  getInterviewRoundsData,
  getSankeyData,
  getWeeklyData,
} from '@/lib/analytics';
import { useEffectiveDayKey } from '@/hooks/useEffectiveDayKey';

export function useAnalyticsKPIs(period: string, asOf?: string) {
  const dayKey = useEffectiveDayKey();

  return useQuery({
    queryKey: ['analytics-kpis', period, dayKey, asOf],
    queryFn: () => getAnalyticsKPIs(period, asOf),
    staleTime: 0,
  });
}

export function useWeeklyActivityData(period: string, asOf?: string) {
  const dayKey = useEffectiveDayKey();

  return useQuery({
    queryKey: ['analytics-weekly', period, dayKey, asOf],
    queryFn: () => getWeeklyData(period, asOf),
    staleTime: 0,
  });
}

export function useSankeyAnalytics(period = 'all', asOf?: string) {
  const dayKey = useEffectiveDayKey();
  return useQuery({
    queryKey: ['analytics-sankey', period, dayKey, asOf],
    queryFn: () => getSankeyData(period, asOf),
    staleTime: 0,
  });
}

export function useHeatmapAnalytics(year?: number | 'rolling') {
  const dayKey = useEffectiveDayKey();

  return useQuery({
    queryKey: ['analytics-heatmap', year ?? 'rolling', dayKey],
    queryFn: () => getHeatmapData(year),
    staleTime: 0,
  });
}

export function useInterviewRoundsAnalytics(
  period: string,
  roundType?: string,
  asOf?: string
) {
  const dayKey = useEffectiveDayKey();

  return useQuery({
    queryKey: [
      'analytics-interview-rounds',
      period,
      roundType ?? 'all',
      dayKey,
      asOf,
    ],
    queryFn: () => getInterviewRoundsData(period, roundType, asOf),
    staleTime: 0,
  });
}
