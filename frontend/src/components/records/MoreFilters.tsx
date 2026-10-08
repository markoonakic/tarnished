import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Company } from '@/lib/apiV030';
import { advancedFilterKeys, recordFilterKeys } from '@/lib/recordFilters';
import Dropdown from '../Dropdown';
import SearchableCombobox from '../SearchableCombobox';
import TagInput from '../TagInput';
import {
  employmentTypes,
  priorities,
  recordCompanies,
  recordInput,
  workModes,
} from '@/lib/records';

export default function MoreFilters({
  params,
  type,
  onChange,
  statusLabels = {},
  children,
}: {
  params: URLSearchParams;
  type: 'lead' | 'application';
  onChange: (updates: Record<string, string | string[]>) => void;
  statusLabels?: Record<string, string>;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let current = true;
    recordCompanies()
      .then((data) => {
        if (current) {
          setCompanies(data);
          setError('');
        }
      })
      .catch(() => {
        if (current) setError(t('records.companiesFailed'));
      });
    return () => {
      current = false;
    };
  }, [open, t]);
  const count = advancedFilterKeys.filter(
    (key) => key !== 'date_field' && params.has(key)
  ).length;
  const active = recordFilterKeys.flatMap((key) =>
    params
      .getAll(key)
      .filter(Boolean)
      .map((value) => ({ key, value }))
  );
  function label(key: string, value: string) {
    if (key === 'company_id')
      return (
        companies.find((company) => company.id === value)?.name ||
        t('records.selectedCompany')
      );
    if (key === 'status') return statusLabels[value] || value;
    if (key === 'decision') return t('records.decision.' + value);
    if (
      ['work_mode', 'employment_type', 'priority', 'date_field'].includes(key)
    )
      return t('records.' + value);
    if (key === 'show_archived') return t('records.yes');
    return value;
  }
  const selects = [
    ['work_mode', workModes],
    ['employment_type', employmentTypes],
    ['priority', priorities],
  ] as const;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="bg-bg2 text-fg1 hover:bg-bg3 focus:ring-accent order-2 cursor-pointer rounded px-3 py-2 text-sm focus:ring-2"
      >
        <i className="bi-sliders mr-2" aria-hidden="true" />
        {t('records.moreFilters', { count })}
      </button>
      {open && (
        <div
          id={id}
          className="border-tertiary order-10 basis-full border-t pt-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor={id + '-company'}
                className="text-muted mb-1 block text-sm"
              >
                {t('records.company')}
              </label>
              <SearchableCombobox
                id={id + '-company'}
                options={[
                  { value: '', label: t('records.any') },
                  ...companies.map((company) => ({
                    value: company.id,
                    label: company.name,
                  })),
                ]}
                value={params.get('company_id') || ''}
                onChange={(value) => onChange({ company_id: value })}
                placeholder={t('records.any')}
              />
            </div>
            <label className="text-muted block text-sm">
              {t('records.location')}
              <input
                className={recordInput}
                value={params.get('location') || ''}
                onChange={(event) => onChange({ location: event.target.value })}
              />
            </label>
            {selects.slice(0, 2).map(([key, values]) => (
              <div key={key}>
                <label
                  htmlFor={id + key}
                  className="text-muted mb-1 block text-sm"
                >
                  {t('records.' + key)}
                </label>
                <Dropdown
                  id={id + key}
                  value={params.get(key) || ''}
                  options={[
                    { value: '', label: t('records.any') },
                    ...values.map((value) => ({
                      value,
                      label: t('records.' + value),
                    })),
                  ]}
                  onChange={(value) => onChange({ [key]: value })}
                />
              </div>
            ))}
            <label className="text-muted block text-sm">
              {t('records.seniority')}
              <input
                className={recordInput}
                value={params.get('seniority') || ''}
                onChange={(event) =>
                  onChange({ seniority: event.target.value })
                }
              />
            </label>
            <div>
              <label
                htmlFor={id + '-priority'}
                className="text-muted mb-1 block text-sm"
              >
                {t('records.priority')}
              </label>
              <Dropdown
                id={id + '-priority'}
                value={params.get('priority') || ''}
                options={[
                  { value: '', label: t('records.any') },
                  ...priorities.map((value) => ({
                    value,
                    label: t('records.' + value),
                  })),
                ]}
                onChange={(value) => onChange({ priority: value })}
              />
            </div>
            <div>
              <label
                htmlFor={id + '-tags'}
                className="text-muted mb-1 block text-sm"
              >
                {t('records.tags')}
              </label>
              <TagInput
                id={id + '-tags'}
                label={t('records.tags')}
                value={params.getAll('tags')}
                onChange={(tags) => onChange({ tags })}
              />
            </div>
            <div>
              <label
                htmlFor={id + '-date'}
                className="text-muted mb-1 block text-sm"
              >
                {t('records.date')}
              </label>
              <Dropdown
                id={id + '-date'}
                value={
                  params.get('date_field') ||
                  (type === 'lead' ? 'added' : 'applied')
                }
                options={(type === 'lead'
                  ? ['added', 'deadline', 'posted', 'updated']
                  : ['applied', 'updated', 'deadline', 'created']
                ).map((value) => ({ value, label: t('records.' + value) }))}
                onChange={(value) => onChange({ date_field: value })}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-muted text-xs">
                  {t('records.from')}
                  <input
                    className={recordInput}
                    type="date"
                    value={params.get('date_from') || ''}
                    onChange={(event) =>
                      onChange({ date_from: event.target.value })
                    }
                  />
                </label>
                <label className="text-muted text-xs">
                  {t('records.to')}
                  <input
                    className={recordInput}
                    type="date"
                    value={params.get('date_to') || ''}
                    onChange={(event) =>
                      onChange({ date_to: event.target.value })
                    }
                  />
                </label>
              </div>
            </div>
          </div>
          <label className="text-muted mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="focus:ring-accent accent-accent focus:ring-2"
              checked={params.get('show_archived') === 'true'}
              onChange={(event) =>
                onChange({ show_archived: event.target.checked ? 'true' : '' })
              }
            />
            {t('records.showArchived')}
          </label>
          {children && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {children}
            </div>
          )}
          {error && (
            <p role="alert" className="text-red mt-2 text-sm">
              {error}
            </p>
          )}
        </div>
      )}
      {!!active.length && (
        <div className="order-20 flex basis-full flex-wrap items-center gap-2">
          {active.map(({ key, value }) => (
            <button
              key={key + value}
              className="bg-bg3 text-fg1 focus:ring-accent rounded-full px-3 py-1 text-xs focus:ring-2"
              aria-label={t('records.removeFilter', {
                label: t('records.' + key),
                value: label(key, value),
              })}
              onClick={() =>
                onChange({
                  [key]:
                    key === 'tags'
                      ? params.getAll(key).filter((tag) => tag !== value)
                      : '',
                })
              }
            >
              {t('records.' + key)}: {label(key, value)}{' '}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button
            className="text-accent focus:ring-accent rounded px-2 py-1 text-xs focus:ring-2"
            onClick={() =>
              onChange(
                Object.fromEntries(recordFilterKeys.map((key) => [key, '']))
              )
            }
          >
            {t('records.clearAll')}
          </button>
        </div>
      )}
    </>
  );
}
