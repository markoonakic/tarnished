import { useState, type ReactNode } from 'react';
import CollapsibleCard from '../CollapsibleCard';
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
  actions,
  children,
}: {
  applicationId: string;
  roundId: string;
  revision: number;
  onUpdated?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
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
    <CollapsibleCard
      title={t('tasks.preparation')}
      icon="bi-book"
      actions={
        <>
          <button
            type="button"
            className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
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
          {actions}
        </>
      }
    >
      {children}
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
                className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                disabled={saving}
                onClick={() => void save(true)}
              >
                <i className="bi-x-lg icon-sm" aria-hidden="true" />
                {t('ai.discard')}
              </button>
              <button
                type="button"
                className="bg-accent text-bg0 hover:bg-accent-bright focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                disabled={disabled || !selected.size || analysis.stale}
                onClick={() => void save()}
              >
                <i className="bi-check2 icon-sm" aria-hidden="true" />
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
                      className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
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
                      <i
                        className="bi-arrow-right icon-sm"
                        aria-hidden="true"
                      />
                      {t('ai.selectAll')}
                    </button>
                  )}
                </div>
                {(items[category] ?? []).map((item) => (
                  <div key={item.id} className="mb-3 text-sm">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="accent-accent focus:ring-accent bg-bg2 border-muted checked:border-accent checked:bg-accent checked:after:text-bg0 mt-1 h-4 w-4 shrink-0 appearance-none rounded border checked:after:block checked:after:text-center checked:after:content-['✓'] focus:ring-2"
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
                          className="text-accent hover:text-accent-bright focus:ring-accent cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2"
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
    </CollapsibleCard>
  );
}
