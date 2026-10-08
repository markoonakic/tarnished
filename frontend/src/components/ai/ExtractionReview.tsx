import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '@/components/Card';
import SearchableCombobox from '@/components/SearchableCombobox';
import { useJobAnalysis } from '@/hooks/useJobAnalysis';
import {
  analysesApi,
  type AnalysisTarget,
  type Proposal,
  type ReviewChoice,
} from '@/lib/apiAnalyses';
import { apiV030, type Company } from '@/lib/apiV030';
import AnalysisStatus from './AnalysisStatus';

const ghost =
  'cursor-pointer rounded px-2 py-1 text-sm hover:bg-bg3 disabled:cursor-not-allowed disabled:opacity-50';
const primary = `${ghost} bg-accent text-bg0 hover:bg-accent-bright`;
const basics = [
  'title',
  'company',
  'location',
  'work_mode',
  'employment_type',
  'seniority',
];
const pay = ['salary_min', 'salary_max', 'salary_currency', 'pay_period'];
const group = (item: Proposal) =>
  basics.includes(item.field)
    ? 'basics'
    : pay.includes(item.field)
      ? 'pay'
      : item.field;

export default function ExtractionReview({
  target,
  refreshKey,
  source,
  current = {},
  legacy = [],
  onUpdated,
  hideEmpty = false,
}: {
  target: AnalysisTarget;
  refreshKey?: string | number;
  source?: string | null;
  current?: Record<string, unknown>;
  legacy?: string[];
  onUpdated?: () => void;
  hideEmpty?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const controller = useJobAnalysis('EXTRACTION', target, refreshKey);
  const { analysis, busy, loading, running } = controller;
  const [choices, setChoices] = useState<Record<string, ReviewChoice>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const items = analysis?.draft.items ?? [];
  const hasCompany = items.some((item) => item.field === 'company');
  useEffect(() => {
    if (!hasCompany) return;
    let active = true;
    async function loadCompanies() {
      const first = await apiV030.companies({ page: 1, per_page: 100 });
      const items = [...first.items];
      for (
        let page = 2;
        active && page <= Math.ceil(first.total / 100);
        page++
      ) {
        items.push(...(await apiV030.companies({ page, per_page: 100 })).items);
      }
      if (active) setCompanies(items);
    }
    void loadCompanies().catch(() => {
      if (active) controller.setError(true);
    });
    return () => {
      active = false;
    };
    // Company options do not change on every polling read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompany]);
  useEffect(() => {
    setChoices({});
    setEditing(null);
    setCompanyId('');
  }, [analysis?.id, analysis?.revision]);
  const disabled = busy || running || saving || loading;
  const reviewed = Object.values(choices);
  const companyNeeded =
    items.some(
      (item) =>
        item.field === 'company' &&
        choices[item.id] &&
        choices[item.id].decision !== 'rejected'
    ) && !companyId;
  const groups = [...new Set(items.map(group))];
  const displayValue = (field: string, value: string | number) =>
    ['work_mode', 'employment_type', 'pay_period'].includes(field)
      ? t(`ai.value.${value}`, { defaultValue: String(value) })
      : value;
  function decide(item: Proposal, decision: ReviewChoice['decision']) {
    setChoices((value) => ({
      ...value,
      [item.id]: { id: item.id, decision, value: item.value },
    }));
    setEditing(null);
  }
  async function save() {
    if (!analysis) return;
    setSaving(true);
    controller.setError(false);
    try {
      const payload = reviewed.map((choice) =>
        items.find((item) => item.id === choice.id)?.field === 'company'
          ? { ...choice, company_id: companyId || undefined }
          : choice
      );
      const revision = current.evidence_revision ?? current.revision;
      controller.setAnalysis(
        await analysesApi.review(
          typeof revision === 'number'
            ? { ...analysis, target_revision: revision }
            : analysis,
          payload
        )
      );
      setChoices({});
      onUpdated?.();
    } catch {
      controller.setError(true);
    } finally {
      setSaving(false);
    }
  }
  const run = (
    <button
      type="button"
      className={ghost}
      disabled={disabled || !source}
      onClick={() => void controller.run()}
    >
      <i className="bi-stars mr-1" aria-hidden="true" />
      {t(analysis ? 'ai.runAgain' : 'ai.extract')}
    </button>
  );
  if (hideEmpty && !analysis && !controller.error) return null;
  if (analysis?.review_state === 'saved')
    return (
      <Card
        title={t('ai.reviewedSummary', {
          date: new Intl.DateTimeFormat(
            i18n.language === 'sr-Latn' ? 'sr-Latn-RS' : 'en-GB'
          ).format(new Date(analysis.updated_at)),
          accepted: analysis.reviewed.filter(
            (row) => row.decision === 'accepted'
          ).length,
          edited: analysis.reviewed.filter((row) => row.decision === 'edited')
            .length,
          rejected: analysis.reviewed.filter(
            (row) => row.decision === 'rejected'
          ).length,
        })}
        icon="bi-check2-all"
        actions={run}
        className="border-accent border-l-2"
      >
        <AnalysisStatus controller={controller} />
      </Card>
    );
  return (
    <Card
      title={
        <>
          {t('ai.reviewTitle')}{' '}
          {items.length > 0 && (
            <span className="text-muted ml-2 text-xs font-normal">
              {t('ai.proposalCount', {
                count: items.length,
                reviewed: reviewed.length,
              })}
            </span>
          )}
        </>
      }
      icon="bi-stars"
      className={items.length ? 'border-accent border-l-2' : ''}
      actions={
        items.length ? (
          <>
            <button
              type="button"
              className={ghost}
              disabled={disabled || analysis?.stale}
              onClick={() => {
                setChoices(
                  Object.fromEntries(
                    items.map((item) => [
                      item.id,
                      { id: item.id, decision: 'accepted', value: item.value },
                    ])
                  )
                );
                setEditing(null);
              }}
            >
              {t('ai.acceptAll')}
            </button>
            <button
              type="button"
              className={primary}
              disabled={
                disabled || !reviewed.length || companyNeeded || analysis?.stale
              }
              onClick={() => void save()}
            >
              {t('ai.saveReviewed')}
            </button>
          </>
        ) : (
          run
        )
      }
    >
      <AnalysisStatus controller={controller} />
      {analysis?.stale && items.length > 0 && (
        <div className="text-yellow-bright mb-4 text-sm">
          {t('ai.sourceChanged')} {run}
        </div>
      )}
      <p className="text-muted mb-4 text-xs">{t('ai.reviewHint')}</p>
      {legacy.length > 0 && !analysis?.reviewed.length && (
        <p className="text-muted mb-4 text-xs">
          {t('ai.notReviewed')}: {legacy.join(' · ')}
        </p>
      )}
      {groups.map((name) => (
        <div key={name} className="mb-4 last:mb-0">
          <h4 className="text-muted mb-1 text-xs font-semibold uppercase">
            {t(`ai.field.${name}`)}
          </h4>
          {items
            .filter((item) => group(item) === name)
            .map((item) => {
              const choice = choices[item.id];
              const currentValue =
                current[item.field === 'title' ? 'job_title' : item.field] ??
                current[item.field];
              return (
                <div
                  key={item.id}
                  className="border-bg3 grid grid-cols-1 gap-2 border-b py-3 last:border-0 sm:grid-cols-[8rem_1fr_auto]"
                >
                  <span className="text-muted text-xs">
                    {t(`ai.field.${item.field}`)}
                  </span>
                  <div className="min-w-0 text-sm break-words">
                    {editing === item.id ? (
                      <label className="block">
                        <span className="sr-only">{t('ai.editValue')}</span>
                        <input
                          className="bg-bg2 border-bg3 w-full rounded border p-2"
                          type={
                            typeof item.value === 'number' ? 'number' : 'text'
                          }
                          value={choice?.value ?? item.value}
                          onChange={(event) =>
                            setChoices((value) => ({
                              ...value,
                              [item.id]: {
                                id: item.id,
                                decision: 'edited',
                                value: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    ) : (
                      <span>
                        {displayValue(item.field, choice?.value ?? item.value)}
                      </span>
                    )}
                    {currentValue != null && currentValue !== '' && (
                      <p className="text-muted mt-1 text-xs">
                        {t('ai.current', { value: String(currentValue) })}
                      </p>
                    )}
                    <blockquote className="border-accent text-muted mt-1 border-l pl-3 text-xs italic">
                      “{item.quote}”{' '}
                      <span className="not-italic">
                        · {t('ai.fromPosting')}
                      </span>
                    </blockquote>
                    {choice?.decision === 'edited' && (
                      <p className="text-muted mt-1 text-xs">
                        {t('ai.userEdited')}
                      </p>
                    )}
                    {item.field === 'company' && (
                      <div className="mt-2">
                        <label
                          htmlFor={`company-${item.id}`}
                          className="text-muted mb-1 block text-xs"
                        >
                          {t('ai.chooseCompany')}
                        </label>
                        <SearchableCombobox
                          id={`company-${item.id}`}
                          options={companies.map((company) => ({
                            value: company.id,
                            label: company.name,
                          }))}
                          value={companyId}
                          disabled={disabled}
                          onChange={setCompanyId}
                          onCreate={(name) => {
                            void apiV030
                              .createCompany({ name })
                              .then((company) => {
                                setCompanies((value) => [...value, company]);
                                setCompanyId(company.id);
                              })
                              .catch(() => controller.setError(true));
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-start gap-1 sm:justify-end">
                    {choice && editing !== item.id ? (
                      <>
                        <span
                          className={`rounded px-2 py-1 text-xs ${choice.decision === 'accepted' ? 'bg-green-bright/10 text-green-bright' : choice.decision === 'edited' ? 'bg-blue-bright/10 text-blue-bright' : 'bg-red-bright/10 text-red-bright'}`}
                        >
                          {t(`ai.${choice.decision}`)}
                        </span>
                        <button
                          type="button"
                          className={`${ghost} text-muted text-xs`}
                          disabled={disabled}
                          onClick={() =>
                            setChoices((value) => {
                              const copy = { ...value };
                              delete copy[item.id];
                              return copy;
                            })
                          }
                        >
                          {t('ai.undo')}
                        </button>
                      </>
                    ) : editing === item.id ? (
                      <button
                        type="button"
                        className={ghost}
                        onClick={() => setEditing(null)}
                      >
                        {t('ai.done')}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`${ghost} text-green-bright`}
                          disabled={disabled || analysis?.stale}
                          aria-label={t('ai.acceptRow', {
                            value: displayValue(item.field, item.value),
                          })}
                          title={t('ai.accept')}
                          onClick={() => decide(item, 'accepted')}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className={ghost}
                          disabled={disabled || analysis?.stale}
                          aria-label={t('ai.editRow', {
                            value: displayValue(item.field, item.value),
                          })}
                          title={t('ai.edit')}
                          onClick={() => {
                            decide(item, 'edited');
                            setEditing(item.id);
                          }}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className={`${ghost} text-red-bright`}
                          disabled={disabled || analysis?.stale}
                          aria-label={t('ai.rejectRow', {
                            value: displayValue(item.field, item.value),
                          })}
                          title={t('ai.reject')}
                          onClick={() => decide(item, 'rejected')}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </Card>
  );
}
