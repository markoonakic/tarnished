import type { CalculationScope, CurrentRecordBasis } from './analytics';
import api, { withAxiosTimeZoneHeaders } from './api';

export interface DashboardKPIs {
  scope: CalculationScope;
  current_record_basis: CurrentRecordBasis;
  last_7_days: number;
  last_7_days_trend: number | null;
  last_30_days: number;
  last_30_days_trend: number | null;
  active_opportunities: number;
  unknown_opportunities: number;
}

export interface NeedsAttentionItem {
  id: string;
  company: string;
  job_title: string;
  days_since: number;
  reason: string;
  current_stage_age_hours: number | null;
}

export interface NeedsAttentionData {
  scope: CalculationScope;
  current_record_basis: CurrentRecordBasis;
  follow_ups: NeedsAttentionItem[];
  no_responses: NeedsAttentionItem[];
  interviewing: NeedsAttentionItem[];
}

export async function getDashboardKPIs(): Promise<DashboardKPIs> {
  const response = await api.get('/api/dashboard/kpis', {
    headers: withAxiosTimeZoneHeaders(),
  });
  return response.data;
}

export async function getNeedsAttention(): Promise<NeedsAttentionData> {
  const response = await api.get('/api/dashboard/needs-attention', {
    headers: withAxiosTimeZoneHeaders(),
  });
  return response.data;
}
