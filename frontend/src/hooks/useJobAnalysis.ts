import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import {
  analysesApi,
  type Analysis,
  type AnalysisKind,
  type AnalysisRead,
  type AnalysisTarget,
} from '@/lib/apiAnalyses';

/** Only explicit actions dispatch. Polling reads the same intent after uncertain responses. */
export function useJobAnalysis(
  kind: AnalysisKind,
  target: AnalysisTarget,
  refreshKey?: string | number
) {
  const { i18n } = useTranslation();
  const [data, setData] = useState<AnalysisRead>({
    analysis: null,
    requirements: [],
    profile: [],
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const attempt = useRef<{ analysis: Analysis; intent: string } | null>(null);
  const { lead_id, application_id, round_id } = target;
  const readId = useRef(0);
  const read = useCallback(async () => {
    const id = ++readId.current;
    try {
      const value = await analysesApi.latest(kind, {
        lead_id,
        application_id,
        round_id,
      });
      if (id === readId.current) {
        setData({analysis: value.analysis ?? null, requirements: value.requirements ?? [], profile: value.profile ?? []});
        setError(false);
      }
    } catch {
      if (id === readId.current) setError(true);
    } finally {
      if (id === readId.current) setLoading(false);
    }
  }, [kind, lead_id, application_id, round_id]);
  useEffect(() => {
    setLoading(true);
    void read();
    return () => {
      ++readId.current;
    };
  }, [read, refreshKey]);
  const analysis = data.analysis;
  const running =
    !!analysis && ['queued', 'analyzing'].includes(analysis.state);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      void read();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [running, read]);
  const setAnalysis = (value: Analysis) =>
    setData((previous) => ({ ...previous, analysis: value }));
  async function run() {
    if (busy || running) return;
    setBusy(true);
    setError(false);
    try {
      if (!attempt.current) {
        const created = await analysesApi.create(
          kind,
          { lead_id, application_id, round_id },
          i18n.language === 'sr-Latn' ? 'sr-Latn' : 'en'
        );
        attempt.current = { analysis: created, intent: crypto.randomUUID() };
      }
      const value = await analysesApi.run(
        attempt.current.analysis,
        attempt.current.intent
      );
      setAnalysis(value);
      attempt.current = null;
    } catch (error) {
      if (isAxiosError(error) && error.response) attempt.current = null;
      await read();
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return {
    analysis,
    requirements: data.requirements,
    profile: data.profile,
    busy,
    loading,
    running,
    error,
    setError,
    setAnalysis,
    run,
    reload: read,
  };
}
export type JobAnalysisController = ReturnType<typeof useJobAnalysis>;
