import { fetchWithAuth, isAuthenticated } from './api';

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
  if (!isAuthenticated()) {
    return false;
  }

  const response = await fetchWithAuth('/api/analytics/insights/configured');

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
  if (!isAuthenticated()) {
    throw new Error('Not authenticated');
  }

  const response = await fetchWithAuth('/api/analytics/insights', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ period }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: 'Failed to generate insights' }));
    throw new Error(error.detail || 'Failed to generate insights');
  }

  return response.json();
}
