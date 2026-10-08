import api, { withAxiosTimeZoneHeaders } from './api';
import type { StatusMeaning } from './types';

export interface CalculationScope {
  period: string;
  cohort_start: string | null;
  cohort_end: string;
  as_of: string;
  time_zone: string;
  denominator: number;
  basis: string;
}
export interface CurrentRecordBasis {
  observed_at: string;
  basis: string;
}
interface StageVisit {
  application_id: string;
  entry_id: string;
  exit_id: string | null;
  meaning: StatusMeaning;
  entered_at: string;
  ended_at: string | null;
  kind: string;
  hours: number | null;
  reason: string | null;
}
interface ApplicationEvidenceMetrics {
  application_id: string;
  company: string;
  job_title: string;
  source?: string | null;
  applied_at: string;
  evidence_revision: number;
  current_meaning: StatusMeaning;
  as_of_meaning: StatusMeaning;
  response_recorded: boolean;
  response_state: string;
  response_occurred_on: string | null;
  response_recorded_at: string | null;
  current_stage_age_hours: number | null;
  missing_prefix: boolean;
  gap_ids: string[];
  unknown_history_ids: string[];
  ambiguous_time_ids: string[];
}
export interface PipelineMetrics {
  scope: CalculationScope;
  current_record_basis: CurrentRecordBasis;
  total_applications: number;
  responded: number;
  response_rate: number | null;
  response_unknown: number;
  response_undated: number;
  response_not_recorded_as_of: number;
  interviews: number;
  offers: number;
  interview_rate: number | null;
  offer_rate: number | null;
  active_applications: number;
  closed_applications: number;
  unknown_applications: number;
  current_stage_breakdown: Record<string, number>;
  stage_breakdown: Record<string, number>;
  applications: ApplicationEvidenceMetrics[];
  visits: StageVisit[];
  stage_totals: {
    application_id: string;
    meaning: StatusMeaning;
    hours: number;
  }[];
  coverage: Record<string, number>;
}

export interface SankeyNode {
  builtin_key?: string | null;
  meaning: string;
  application_id: string;
  entered_at: string;
  id: string;
  name: string;
  color?: string;
  value?: number; // Explicit value for nodes without incoming links
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  scope: CalculationScope;
  coverage: Record<string, number>;
  nodes: SankeyNode[];
  links: SankeyLink[];
}

interface HeatmapDay {
  date: string;
  count: number;
}

export interface HeatmapData {
  days: HeatmapDay[];
  max_count: number;
}

export async function getSankeyData(
  period = 'all',
  asOf?: string
): Promise<SankeyData> {
  const response = await api.get('/api/analytics/sankey', {
    params: { period, as_of: asOf },
    headers: withAxiosTimeZoneHeaders(),
  });
  return response.data;
}

export interface AnalyticsKPIs extends PipelineMetrics {
  application_to_interview_rate: number | null;
  active_opportunities: number;
}

export async function getHeatmapData(
  year?: number | 'rolling'
): Promise<HeatmapData> {
  const params: Record<string, string | number | boolean> = {};
  if (year === 'rolling') {
    params.rolling = true;
  } else if (year) {
    params.year = year;
  }
  const response = await api.get('/api/analytics/heatmap', {
    params,
    headers: withAxiosTimeZoneHeaders(),
  });
  return response.data;
}

export interface FunnelData {
  builtin_key?: string | null;
  round: string;
  count: number;
  passed: number;
  conversion_rate: number;
}

export interface OutcomeData {
  builtin_key?: string | null;
  round: string;
  passed: number;
  failed: number;
  pending: number;
  withdrew: number;
}

export interface TimelineData {
  builtin_key?: string | null;
  round: string;
  avg_days: number;
  avg_hours?: number | null;
}

interface RoundProgress {
  round_type: string;
  outcome: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  days_in_round: number | null;
}

interface CandidateProgress {
  application_id: string;
  candidate_name: string;
  role: string;
  rounds_completed: RoundProgress[];
  current_status: string;
}

interface InterviewRoundsResponse {
  scope: CalculationScope;
  duration_basis: string;
  funnel_data: FunnelData[];
  outcome_data: OutcomeData[];
  timeline_data: TimelineData[];
  candidate_progress: CandidateProgress[];
}

export async function getAnalyticsKPIs(
  period: string = '30d',
  asOf?: string
): Promise<AnalyticsKPIs> {
  const response = await api.get(`/api/analytics/kpis`, {
    params: { period, as_of: asOf },
    headers: withAxiosTimeZoneHeaders(),
  });
  return response.data;
}

export interface WeeklyData {
  week: string;
  applications: number;
  interviews: number;
  rounds_scheduled: number;
  rounds_completed: number;
}

export async function getWeeklyData(
  period: string = '30d',
  asOf?: string
): Promise<WeeklyData[]> {
  const response = await api.get(`/api/analytics/weekly`, {
    params: { period, as_of: asOf },
    headers: withAxiosTimeZoneHeaders(),
  });
  return response.data;
}

export async function getInterviewRoundsData(
  period: string = 'all',
  roundType?: string,
  asOf?: string
): Promise<InterviewRoundsResponse> {
  const params: Record<string, string> = { period };
  if (roundType) params.round_type = roundType;
  if (asOf) params.as_of = asOf;
  const response = await api.get('/api/analytics/interview-rounds', {
    params,
    headers: withAxiosTimeZoneHeaders(),
  });
  return response.data;
}
