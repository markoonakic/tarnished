import { useState, useEffect, useCallback } from 'react';
import { generateInsights, isAIConfigured, type GraceInsights } from '@/lib/insights';

export function useGraceInsights(period: string) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<GraceInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if AI is configured on mount
  useEffect(() => {
    isAIConfigured()
      .then(setConfigured)
      .catch(() => setConfigured(false));
  }, []);

  // Clear insights when period changes
  useEffect(() => {
    setInsights(null);
    setError(null);
  }, [period]);

  const seekGrace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateInsights(period);
      setInsights(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate insights';
      setError(message);
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  const clearInsights = useCallback(() => {
    setInsights(null);
    setError(null);
  }, []);

  return {
    configured,
    loading,
    insights,
    error,
    seekGrace,
    clearInsights,
  };
}
