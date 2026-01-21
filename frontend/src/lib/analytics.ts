import api from './api';

export interface SankeyNode {
  id: string;
  name: string;
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

export async function getHeatmapData(year?: number): Promise<HeatmapData> {
  const params = year ? { year } : {};
  const response = await api.get('/api/analytics/heatmap', { params });
  return response.data;
}
