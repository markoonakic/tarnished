import { useTranslation } from 'react-i18next';
import type { JobAnalysisController } from '@/hooks/useJobAnalysis';
export default function AnalysisStatus({
  controller,
}: {
  controller: JobAnalysisController;
}) {
  const { t } = useTranslation();
  const { analysis, loading, busy, running, error, reload } = controller;
  if (error || analysis?.error)
    return (
      <p role="alert" className="text-yellow-bright my-3 text-sm">
        {t('ai.failed')}{' '}
        <button
          type="button"
          className="text-accent cursor-pointer underline"
          onClick={() => void reload()}
        >
          {t('ai.checkStatus')}
        </button>
      </p>
    );
  if (loading || busy || running)
    return (
      <p role="status" className="text-muted my-3 text-sm">
        <i
          className="bi-arrow-repeat mr-2 inline-block animate-spin"
          aria-hidden="true"
        />
        {t(
          loading
            ? 'ai.loading'
            : analysis?.state === 'queued'
              ? 'ai.queued'
              : 'ai.analyzing'
        )}
      </p>
    );
  return null;
}
