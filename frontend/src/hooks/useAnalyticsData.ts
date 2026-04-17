import { useQuery } from '@tanstack/react-query';

import {
  getAnalyticsKPIs,
  getHeatmapData,
  getInterviewRoundsData,
  getSankeyData,
  getWeeklyData,
} from '@/lib/analytics';
import { useEffectiveDayKey } from '@/hooks/useEffectiveDayKey';

export function useAnalyticsKPIs(period: string) {
  const dayKey = useEffectiveDayKey();

  return useQuery({
    queryKey: ['analytics-kpis', period, dayKey],
    queryFn: () => getAnalyticsKPIs(period),
    staleTime: 0,
  });
}

export function useWeeklyActivityData(period: string) {
  const dayKey = useEffectiveDayKey();

  return useQuery({
    queryKey: ['analytics-weekly', period, dayKey],
    queryFn: () => getWeeklyData(period),
    staleTime: 0,
  });
}

export function useSankeyAnalytics() {
  return useQuery({
    queryKey: ['analytics-sankey'],
    queryFn: getSankeyData,
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
  roundType?: string
) {
  const dayKey = useEffectiveDayKey();

  return useQuery({
    queryKey: [
      'analytics-interview-rounds',
      period,
      roundType ?? 'all',
      dayKey,
    ],
    queryFn: () => getInterviewRoundsData(period, roundType),
    staleTime: 0,
  });
}
