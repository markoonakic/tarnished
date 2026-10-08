import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useJobAnalysis } from '@/hooks/useJobAnalysis';
import { analysesApi, preparationCategories } from '@/lib/apiAnalyses';
import AnalysisStatus from './AnalysisStatus';

/** Place inside the interview Preparation card. Saves append to its seven lists. */
export default function PreparationDraft({
  applicationId,
  roundId,
  revision,
  onUpdated,
}: {
  applicationId: string;
  roundId: string;
  revision: number;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const controller = useJobAnalysis(
    'PREPARATION',
    { application_id: applicationId, round_id: roundId },
    revision
  );
  const { analysis, busy, running, loading } = controller;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const disabled = busy || running || loading || saving;
  const hint = !controller.requirements.length
    ? 'ai.reviewFirst'
    : !controller.profile.length
      ? 'ai.profileFirst'
      : null;
  const items = analysis?.draft;
  const show =
    items &&
    preparationCategories.some((category) => items[category]?.length) &&
    !['saved', 'discarded'].includes(analysis.review_state);
  async function save(discard = false) {
    if (!analysis) return;
    setSaving(true);
    controller.setError(false);
    try {
      controller.setAnalysis(
        discard
          ? await analysesApi.discard(analysis)
          : await analysesApi.apply(analysis, revision, [...selected])
      );
      setSelected(new Set());
      if (!discard) onUpdated?.();
    } catch {
      controller.setError(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="text-accent hover:bg-bg3 cursor-pointer rounded px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || !!hint}
          title={hint ? t(hint) : undefined}
          onClick={() => {
            setSelected(new Set());
            void controller.run();
          }}
        >
          <i className="bi-stars mr-1" aria-hidden="true" />
          {t('ai.draftWithAi')}
        </button>
      </div>
      {hint && <p className="text-muted text-xs">{t(hint)}</p>}
      <AnalysisStatus controller={controller} />
      {show && (
        <div className="border-accent bg-bg2 mt-3 rounded-lg border-l-2 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">
              <i className="bi-stars text-accent mr-2" aria-hidden="true" />
              {t('ai.draftNotSaved')}
            </h4>
            <div className="flex gap-2">
              <button
                type="button"
                className="hover:bg-bg3 cursor-pointer rounded px-2 py-1 text-sm"
                disabled={saving}
                onClick={() => void save(true)}
              >
                {t('ai.discard')}
              </button>
              <button
                type="button"
                className="bg-accent text-bg0 cursor-pointer rounded px-3 py-1 text-sm disabled:opacity-50"
                disabled={disabled || !selected.size || analysis.stale}
                onClick={() => void save()}
              >
                {t('ai.saveSelected', { count: selected.size })}
              </button>
            </div>
          </div>
          {analysis.stale && (
            <p role="status" className="text-yellow-bright mb-4 text-sm">
              {t('ai.matchStale')}
            </p>
          )}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {preparationCategories.map((category) => (
              <div key={category}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h5 className="text-muted text-xs font-semibold uppercase">
                    {t(`ai.category.${category}`)}
                  </h5>
                  {!!items[category]?.length && (
                    <button
                      type="button"
                      className="text-accent hover:bg-bg3 cursor-pointer rounded px-1 text-xs"
                      disabled={disabled}
                      onClick={() =>
                        setSelected(
                          (value) =>
                            new Set([
                              ...value,
                              ...(items[category] ?? []).map((item) => item.id),
                            ])
                        )
                      }
                    >
                      {t('ai.selectAll')}
                    </button>
                  )}
                </div>
                {(items[category] ?? []).map((item) => (
                  <div key={item.id} className="mb-3 text-sm">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="accent-accent mt-1"
                        checked={selected.has(item.id)}
                        disabled={disabled || analysis.stale}
                        onChange={(event) =>
                          setSelected((value) => {
                            const next = new Set(value);
                            if (event.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 break-words">
                        {item.text}
                        {(category === 'practice_questions' ||
                          category === 'company_questions') && (
                          <span className="text-muted text-xs">
                            {' '}
                            · {t('ai.suggestion')}
                          </span>
                        )}
                      </span>
                    </label>
                    {item.evidence.map((citation, index) => (
                      <div key={index} className="mt-1 ml-6 text-xs">
                        <Link
                          className="text-accent hover:underline"
                          to={`/profile#${encodeURIComponent(citation.profile_id)}`}
                        >
                          {controller.profile.find(
                            (profile) => profile.id === citation.profile_id
                          )?.name ?? t('ai.profileItem')}
                        </Link>
                        <blockquote className="text-muted italic">
                          “{citation.quote}”
                        </blockquote>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
