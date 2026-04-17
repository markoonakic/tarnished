import api, { withAxiosTimeZoneHeaders } from './api';

export interface DashboardKPIs {
  last_7_days: number;
  last_7_days_trend: number | null;
  last_30_days: number;
  last_30_days_trend: number | null;
  active_opportunities: number;
}

export interface NeedsAttentionItem {
  id: string;
  company: string;
  job_title: string;
  days_since: number;
}

export interface NeedsAttentionData {
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
