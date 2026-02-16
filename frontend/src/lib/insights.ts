const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
  const response = await fetch(`${API_BASE}/api/analytics/insights/configured`, {
    credentials: 'include',
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
  const response = await fetch(`${API_BASE}/api/analytics/insights`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ period }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to generate insights' }));
    throw new Error(error.detail || 'Failed to generate insights');
  }

  return response.json();
}
