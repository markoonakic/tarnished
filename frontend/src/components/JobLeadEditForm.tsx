import { t, uiLabel, locale } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  jobLeadError,
  updateJobLead,
  type JobLeadUpdate,
} from '../lib/jobLeads';
import type { JobLead } from '../lib/types';
import Modal from './Modal';
import CompanyPicker from './CompanyPicker';

const textFields = [
  ['company', 'Company', 255],
  ['title', 'Title', 255],
  ['description', 'Description', 50000],
  ['location', 'Location', 255],
  ['salary_currency', 'Salary currency', 10],
  ['recruiter_name', 'Recruiter name', 255],
  ['recruiter_title', 'Recruiter title', 255],
  ['recruiter_linkedin_url', 'Recruiter LinkedIn URL', 512],
  ['source', 'Source platform', 100],
  ['posted_date', 'Posted date', 10],
] as const;
const numberFields = [
  ['salary_min', 'Minimum salary'],
  ['salary_max', 'Maximum salary'],
  ['years_experience_min', 'Minimum years experience'],
  ['years_experience_max', 'Maximum years experience'],
] as const;
const listFields = [
  ['requirements_must_have', 'Must-have requirements'],
  ['requirements_nice_to_have', 'Nice-to-have requirements'],
  ['skills', 'Skills'],
] as const;

export default function JobLeadEditForm({
  lead,
  onSaved,
  onCancel,
  onReload,
}: {
  lead: JobLead;
  onSaved: (lead: JobLead) => void;
  onCancel: () => void;
  onReload: () => void;
}) {
  useTranslation();
  // Freeze the revision and baseline for this draft; a newer read must not rebase it silently.
  const [baseline] = useState(lead);
  const [companyId, setCompanyId] = useState(lead.company_id ?? null);
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries([
      ...textFields.map(([key]) => [key, lead[key] ?? '']),
      ...numberFields.map(([key]) => [key, lead[key]?.toString() ?? '']),
      ...listFields.map(([key]) => [key, lead[key].join('\n')]),
    ])
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const inputClass =
    'bg-bg2 text-fg1 focus:ring-accent-bright mt-1 w-full rounded px-3 py-2 font-normal transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none';

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const body: JobLeadUpdate = { expected_revision: baseline.revision };
    if (companyId !== (baseline.company_id ?? null))
      body.company_id = companyId;
    for (const [key, label, limit] of textFields) {
      if (
        Array.from(fields[key]).length > limit ||
        fields[key].includes('\u0000')
      ) {
        setError(
          t(
            '{{value0}} allows up to {{value1}} characters and cannot contain NUL.',
            { value0: uiLabel(label), value1: limit.toLocaleString(locale()) }
          )
        );
        return;
      }
      if (fields[key] !== (baseline[key] ?? ''))
        body[key] = fields[key] || null;
    }
    for (const [key] of numberFields) {
      if (fields[key] !== (baseline[key]?.toString() ?? ''))
        body[key] = fields[key] === '' ? null : Number(fields[key]);
    }
    for (const [key] of listFields) {
      if (fields[key] !== baseline[key].join('\n')) {
        const values = fields[key]
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean);
        if (
          values.length > 200 ||
          values.some((value) => Array.from(value).length > 2000)
        ) {
          setError(
            t('Lists allow up to 200 entries, each up to 2,000 characters.')
          );
          return;
        }
        body[key] = values;
      }
    }
    if (Object.keys(body).length === 1) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      const saved = await updateJobLead(baseline.id, body);
      onSaved(saved);
    } catch (error) {
      const failure = jobLeadError(error);
      setStale(failure.conflict);
      setError(
        failure.conflict
          ? t(
              'This draft is stale or the lead was converted. Your draft is retained, but was not saved. Reload before editing again.'
            )
          : failure.message
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label={t('Edit Job Lead')} onClose={onCancel} busy={busy}>
      <form
        onSubmit={save}
        className="bg-bg1 mx-4 max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg p-6"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-primary text-xl font-semibold">
            {t('Edit Job Lead')}
          </h2>
          <button
            type="button"
            aria-label={t('Close lead editor')}
            disabled={busy}
            onClick={onCancel}
            className="text-fg1 hover:bg-bg2 cursor-pointer rounded p-2"
          >
            <i className="bi-x-lg icon-lg" aria-hidden="true" />
          </button>
        </div>
        {error && (
          <p role="alert" className="text-red-bright">
            {error}
          </p>
        )}
        {stale && (
          <button
            type="button"
            className="text-accent underline"
            onClick={onReload}
          >
            {t('Discard draft and reload saved lead')}
          </button>
        )}
        <fieldset
          disabled={busy || stale}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {textFields.map(([key, label]) => (
            <label
              key={key}
              className={`text-muted block text-sm font-semibold ${key === 'description' ? 'sm:col-span-2' : ''}`}
            >
              {uiLabel(label)}
              {key === 'company' ? (
                <CompanyPicker
                  value={companyId}
                  name={fields.company}
                  onChange={(id, name) => {
                    setCompanyId(id);
                    setFields({ ...fields, company: name });
                  }}
                />
              ) : key === 'description' ? (
                <textarea
                  rows={5}
                  className={inputClass}
                  value={fields[key]}
                  onChange={(event) =>
                    setFields({ ...fields, [key]: event.target.value })
                  }
                />
              ) : (
                <input
                  type={key === 'posted_date' ? 'date' : 'text'}
                  inputMode={
                    key === 'recruiter_linkedin_url' ? 'url' : undefined
                  }
                  className={inputClass}
                  value={fields[key]}
                  onChange={(event) =>
                    setFields({ ...fields, [key]: event.target.value })
                  }
                />
              )}
            </label>
          ))}
          {numberFields.map(([key, label]) => (
            <label key={key} className="text-muted block text-sm font-semibold">
              {uiLabel(label)}
              <input
                type="number"
                min={0}
                max={2147483647}
                step={1}
                className={inputClass}
                value={fields[key]}
                onChange={(event) =>
                  setFields({ ...fields, [key]: event.target.value })
                }
              />
            </label>
          ))}
          {listFields.map(([key, label]) => (
            <label
              key={key}
              className="text-muted block text-sm font-semibold sm:col-span-2"
            >
              {uiLabel(label)} {t('(one per line)')}
              <textarea
                rows={3}
                className={inputClass}
                value={fields[key]}
                onChange={(event) =>
                  setFields({ ...fields, [key]: event.target.value })
                }
              />
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            className="text-fg1 hover:bg-bg2 cursor-pointer rounded-md px-4 py-2 transition-all duration-200 ease-in-out"
            onClick={onCancel}
          >
            {t('Cancel')}
          </button>
          <button
            className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
            disabled={busy || stale}
          >
            {busy ? t('Saving…') : t('Save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
