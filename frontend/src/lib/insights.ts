import { API_BASE } from './api';

export interface SectionInsight {
  key_insight: string;
  trend: string;
  priority_actions: string[];
  pattern?: string;
}

export interface GraceInsights {
  overall_grace: string;
  pipeline_overview: SectionInsight;
  interview_analytics: SectionInsight;
  activity_tracking: SectionInsight;
}

/**
 * Check if AI is configured for insights
 */
export async function isAIConfigured(): Promise<boolean> {
  const token = localStorage.getItem('access_token');
  if (!token) {
    return false;
  }

  const response = await fetch(`${API_BASE}/api/analytics/insights/configured`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  return data.configured === true;
}

/**
 * Generate AI insights for analytics
 */
export async function generateInsights(period: string): Promise<GraceInsights> {
  const token = localStorage.getItem('access_token');
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE}/api/analytics/insights`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ period }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to generate insights' }));
    throw new Error(error.detail || 'Failed to generate insights');
  }

  return response.json();
}
