import api from './api';

export interface SankeyNode {
  id: string;
  name: string;
  color?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface HeatmapDay {
  date: string;
  count: number;
}

export interface HeatmapData {
  days: HeatmapDay[];
  max_count: number;
}

export async function getSankeyData(): Promise<SankeyData> {
  const response = await api.get('/api/analytics/sankey');
  return response.data;
}

export async function getHeatmapData(year?: number | 'rolling'): Promise<HeatmapData> {
  const params: Record<string, string | number | boolean> = {};
  if (year === 'rolling') {
    params.rolling = true;
  } else if (year) {
    params.year = year;
  }
  const response = await api.get('/api/analytics/heatmap', { params });
  return response.data;
}

// Interview Rounds Analytics Types

export interface FunnelData {
  round: string;
  count: number;
  passed: number;
  conversion_rate: number;
}

export interface OutcomeData {
  round: string;
  passed: number;
  failed: number;
  pending: number;
  withdrew: number;
}

export interface TimelineData {
  round: string;
  avg_days: number;
}

interface RoundProgress {
  round_type: string;
  outcome: string | null;
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
  funnel_data: FunnelData[];
  outcome_data: OutcomeData[];
  timeline_data: TimelineData[];
  candidate_progress: CandidateProgress[];
}

export async function getInterviewRoundsData(
  period: string = 'all',
  roundType?: string
): Promise<InterviewRoundsResponse> {
  const params: Record<string, string> = { period };
  if (roundType) params.round_type = roundType;
  const response = await api.get('/api/analytics/interview-rounds', { params });
  return response.data;
}
