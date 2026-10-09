import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Card from '@/components/Card';
import ResultPill, { type MatchResult } from '@/components/ResultPill';
import { useJobAnalysis } from '@/hooks/useJobAnalysis';
import type { AnalysisTarget } from '@/lib/apiAnalyses';
import AnalysisStatus from './AnalysisStatus';

export default function ProfileMatch({
  target,
  refreshKey,
  legacy = [],
}: {
  target: AnalysisTarget;
  refreshKey?: string | number;
  legacy?: string[];
}) {
  const { t } = useTranslation();
  const controller = useJobAnalysis('PROFILE_MATCH', target, refreshKey);
  const { analysis, requirements, profile, busy, loading, running } =
    controller;
  const rows = analysis?.draft.rows ?? [];
  const hint = !requirements.length
    ? 'ai.reviewFirst'
    : !profile.length
      ? 'ai.profileFirst'
      : null;
  const disabled = busy || running || loading || !!hint;
  return (
    <Card
      title={t('ai.profileMatch')}
      icon="bi-person-check"
      actions={
        <button
          type="button"
          className="text-accent hover:bg-bg3 cursor-pointer rounded px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          title={hint ? t(hint) : undefined}
          onClick={() => void controller.run()}
        >
          <i className="bi-arrow-repeat mr-1" aria-hidden="true" />
          {t(analysis ? 'ai.runAgain' : 'ai.compare')}
        </button>
      }
    >
      <AnalysisStatus controller={controller} />
      {hint && <p className="text-muted mb-4 text-sm">{t(hint)}</p>}
      {legacy.length > 0 && !requirements.length && (
        <p className="text-muted mb-4 text-xs">
          {t('ai.notReviewed')}: {legacy.join(' · ')}
        </p>
      )}
      {analysis?.stale && (
        <p
          role="status"
          className="text-yellow-bright bg-bg2 mb-4 rounded p-3 text-sm"
        >
          {t('ai.matchStale')}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                'confirmed',
                'partial',
                'no_evidence',
                'unknown',
              ] as MatchResult[]
            ).map((result) => (
              <ResultPill
                key={result}
                result={result}
                count={rows.filter((row) => row.state === result).length}
              />
            ))}
          </div>
          <div className="bg-bg2 overflow-hidden rounded-lg text-sm">
            <div className="text-muted hidden grid-cols-[1.1fr_1fr_1.3fr_1.1fr] gap-4 p-3 text-xs uppercase md:grid">
              {['requirement', 'result', 'evidence', 'why'].map((key) => (
                <span key={key}>{t(`ai.${key}`)}</span>
              ))}
            </div>
            {rows.map((row) => (
              <div
                key={row.requirement_id}
                className="border-bg3 grid grid-cols-1 gap-3 border-t p-3 md:grid-cols-[1.1fr_1fr_1.3fr_1.1fr]"
              >
                <div className="font-medium break-words">
                  {(analysis?.requirements ?? requirements).find(
                    (item) => item.id === row.requirement_id
                  )?.text ?? row.requirement_id}
                </div>
                <div>
                  <ResultPill result={row.state} />
                </div>
                <div className="min-w-0 text-xs break-words">
                  {row.evidence.length ? (
                    row.evidence.map((citation, index) => (
                      <div key={index} className="mb-2">
                        <Link
                          className="text-accent hover:underline"
                          to={`/profile#${encodeURIComponent(citation.profile_id)}`}
                        >
                          {(() => {
                            const item = profile.find(
                              (item) => item.id === citation.profile_id
                            );
                            return item && item.id === item.name
                              ? t('accounts.' + item.id, {
                                  defaultValue: item.name,
                                }) +
                                  (item.id === 'years_experience'
                                    ? ': ' + Number(item.text)
                                    : '')
                              : (item?.name ?? t('ai.profileItem'));
                          })()}
                        </Link>
                        <blockquote className="border-accent text-muted mt-1 border-l pl-2 italic">
                          “
                          {citation.profile_id === 'years_experience'
                            ? Number(citation.quote)
                            : citation.quote}
                          ”
                        </blockquote>
                      </div>
                    ))
                  ) : (
                    <span className="text-muted">
                      {t(
                        row.state === 'no_evidence'
                          ? 'ai.noAllowedEvidence'
                          : 'ai.notEnoughData'
                      )}
                    </span>
                  )}
                </div>
                <p className="text-muted text-xs break-words">{row.why}</p>
              </div>
            ))}
          </div>
        </>
      )}
      <footer className="text-muted mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>{t('ai.profileFooter')}</span>
        <Link className="text-accent hover:underline" to="/profile">
          {t('ai.openProfile')}
        </Link>
      </footer>
    </Card>
  );
}
