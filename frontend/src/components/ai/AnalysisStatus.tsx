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
          className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
          onClick={() => void reload()}
        >
          <i className="bi-arrow-right icon-sm" aria-hidden="true" />
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
