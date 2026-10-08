import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api, { withAxiosTimeZoneHeaders } from '@/lib/api';
import type { Interview, PreparationKey } from '@/lib/apiV030';
import CollapsibleCard from './CollapsibleCard';
interface DraftItem {
  id: string;
  text: string;
  evidence: { profile_id: string; quote: string }[];
}
interface Analysis {
  id: string;
  revision: number;
  state: string;
  review_state: string;
  stale: boolean;
  error: string | null;
  draft: Partial<Record<PreparationKey, DraftItem[]>>;
}
interface Saved {
  analysis: Analysis | null;
  requirements: unknown[];
  profile: unknown[];
}
export default function InterviewPreparationDraft({
  interview,
  onSaved,
  actions,
  children,
}: {
  interview: Interview;
  onSaved: () => Promise<void>;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [discarded, setDiscarded] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState<{
    id: string;
    revision: number;
    intent: string;
  } | null>(null);
  const query = useQuery({
    queryKey: ['preparation-draft', interview.id],
    queryFn: async () =>
      (
        await api.get<Saved>('/api/job-analyses', {
          params: {
            kind: 'PREPARATION',
            application_id: interview.application_id,
            round_id: interview.id,
          },
        })
      ).data,
    retry: false,
    refetchInterval: (q) =>
      ['queued', 'analyzing'].includes(q.state.data?.analysis?.state ?? '')
        ? 2000
        : false,
    refetchIntervalInBackground: true,
  });
  const row = query.data?.analysis;
  const running = ['queued', 'analyzing'].includes(row?.state ?? '');
  const ready =
    row?.state === 'complete' &&
    row.review_state !== 'saved' &&
    discarded !== row.id;
  const enabled = Boolean(
    query.data?.requirements?.length && query.data?.profile?.length
  );
  const run = async () => {
    if (busy || running || !enabled) return;
    setBusy(true);
    setError(false);
    setSelected([]);
    try {
      const created = attempt ?? {
        ...(
          await api.post<Analysis>(
            '/api/job-analyses',
            {
              kind: 'PREPARATION',
              application_id: interview.application_id,
              round_id: interview.id,
              language: i18n.resolvedLanguage === 'sr-Latn' ? 'sr-Latn' : 'en',
            },
            { headers: withAxiosTimeZoneHeaders() }
          )
        ).data,
        intent: crypto.randomUUID(),
      };
      setAttempt(created);
      await api.post(
        `/api/job-analyses/${created.id}/run`,
        { expected_revision: created.revision, intent_id: created.intent },
        { headers: withAxiosTimeZoneHeaders() }
      );
      setUncertain(false);
      setAttempt(null);
      await query.refetch();
    } catch {
      setUncertain(true);
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <CollapsibleCard
      title={t('tasks.preparation')}
      icon="bi-book"
      actions={
        <>
          <button
            disabled={busy || running || !enabled || uncertain}
            onClick={() => void run()}
            className="text-primary hover:bg-bg2 focus:ring-accent rounded px-3 py-1.5 text-sm focus:ring-2 disabled:opacity-50"
            title={!enabled ? t('tasks.preparationNeedsInputs') : undefined}
          >
            <i className="bi bi-stars mr-2" />
            {t('tasks.draftWithAi')}
          </button>
          {(uncertain || query.isError) && (
            <button
              className="text-accent text-xs underline"
              onClick={async () => {
                const result = await query.refetch();
                if (!result.isError) {
                  if (result.data?.analysis?.state !== 'pending')
                    setAttempt(null);
                  setUncertain(false);
                  setError(false);
                }
              }}
            >
              {t('tasks.checkStatus')}
            </button>
          )}
          {actions}
        </>
      }
    >
      {children}
      {(busy || running) && (
        <p role="status" className="text-muted mt-3 text-sm">
          <i className="bi bi-arrow-repeat mr-2 inline-block animate-spin" />
          {t(
            busy
              ? 'tasks.startingDraft'
              : row?.state === 'queued'
                ? 'tasks.queuedDraft'
                : 'tasks.preparingDraft'
          )}
        </p>
      )}
      {(error || row?.error || query.isError) && (
        <p role="alert" className="text-yellow-bright mt-3 text-sm">
          {t(uncertain ? 'tasks.draftUncertain' : 'tasks.draftFailed')}
        </p>
      )}
      {row?.stale && Object.keys(row.draft).length > 0 && (
        <p className="text-yellow-bright mt-3 text-sm">
          {t('tasks.draftStale')}
        </p>
      )}
      {ready && row && (
        <div className="border-accent bg-bg2 mt-4 rounded-lg border-l-4 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-primary text-sm font-semibold">
              {t('tasks.draftNotSaved')}
            </h4>
            <div className="flex gap-2">
              <button
                className="text-muted rounded px-3 py-1.5 text-sm"
                onClick={() => {
                  setDiscarded(row.id);
                  setSelected([]);
                }}
              >
                {t('tasks.discard')}
              </button>
              <button
                disabled={!selected.length || row.stale || busy}
                className="bg-accent text-bg0 rounded px-3 py-1.5 text-sm disabled:opacity-50"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.post(`/api/job-analyses/${row.id}/apply`, {
                      expected_revision: row.revision,
                      target_revision: interview.revision,
                      selected_ids: selected,
                    });
                    await onSaved();
                    await query.refetch();
                    setSelected([]);
                  } catch {
                    setError(true);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('tasks.saveSelected', { count: selected.length })}
              </button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.entries(row.draft) as [PreparationKey, DraftItem[]][])
              .filter(([, items]) => items.length)
              .map(([key, items]) => (
                <div key={key}>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <h5 className="text-muted text-xs font-semibold uppercase">
                      {t('tasks.field.' + key)}
                    </h5>
                    <button
                      className="text-accent text-xs"
                      onClick={() =>
                        setSelected([
                          ...new Set([...selected, ...items.map((i) => i.id)]),
                        ])
                      }
                    >
                      {t('tasks.selectAll')}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <label
                        key={item.id}
                        className="text-primary flex items-start gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="accent-accent mt-1"
                          checked={selected.includes(item.id)}
                          onChange={() =>
                            setSelected(
                              selected.includes(item.id)
                                ? selected.filter((id) => id !== item.id)
                                : [...selected, item.id]
                            )
                          }
                        />
                        <span>
                          {item.text}
                          {[
                            'practice_questions',
                            'company_questions',
                            'plan',
                          ].includes(key) && (
                            <span className="text-muted text-xs">
                              {' '}
                              · {t('tasks.suggestion')}
                            </span>
                          )}
                          {item.evidence?.map((e) => (
                            <LinkEvidence
                              key={e.profile_id}
                              id={e.profile_id}
                              quote={e.quote}
                            />
                          ))}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}
function LinkEvidence({ id, quote }: { id: string; quote: string }) {
  return (
    <a
      href={`/profile#${encodeURIComponent(id)}`}
      className="text-muted mt-1 block text-xs"
    >
      {quote}
    </a>
  );
}
