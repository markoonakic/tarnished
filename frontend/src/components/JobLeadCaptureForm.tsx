import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createJobLead, jobLeadError } from '../lib/jobLeads';
import { useToast } from '../hooks/useToast';
import Modal from './Modal';
import SegmentedControl from './SegmentedControl';
import CompanyPicker from './CompanyPicker';
import Dropdown from './Dropdown';
import { recordInput, workModes } from '@/lib/records';
import type { WorkMode } from '@/lib/apiV030';

export default function JobLeadCaptureForm({
  onSaved,
}: {
  onSaved?: () => Promise<void>;
}) {
  useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('url');
  const [title, setTitle] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [workMode, setWorkMode] = useState<WorkMode | null>(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duplicateId, setDuplicateId] = useState<string>();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (
      mode !== 'manual' &&
      (Array.from(text).length > 100000 || Array.from(url).length > 2048)
    ) {
      setError(
        t(
          'URL allows up to 2,048 characters; source text allows up to 100,000 characters. Shorten the input before saving.'
        )
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      const lead = await createJobLead(
        mode === 'manual'
          ? {
              title: title.trim(),
              company: company || null,
              company_id: companyId,
              location: location || null,
              work_mode: workMode,
            }
          : { ...(url ? { url } : {}), ...(text ? { text } : {}) }
      );
      setOpen(false);
      setUrl('');
      setText('');
      setTitle('');
      setCompany('');
      setCompanyId(null);
      setLocation('');
      setWorkMode(null);
      toast.success(t('Job lead saved'), {
        label: t('Open'),
        to: `/job-leads/${lead.id}`,
      });
      if (lead.content_warning) toast.warning(lead.content_warning);
      try {
        await onSaved?.();
      } catch {
        toast.error(t('Lead saved, but the list could not be refreshed.'));
      }
    } catch (error) {
      const failure = jobLeadError(error);
      setError(failure.message);
      if (failure.conflict && failure.id) setDuplicateId(failure.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setError('');
          setDuplicateId(undefined);
          setOpen(true);
        }}
        className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
      >
        {t('New Job Lead')}
      </button>
      {open && (
        <Modal
          label={t('New Job Lead')}
          onClose={() => setOpen(false)}
          busy={busy}
        >
          <div className="bg-secondary mx-4 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-primary text-xl font-semibold">
                {t('New Job Lead')}
              </h2>
              <button
                type="button"
                aria-label={t('Close new job lead')}
                disabled={busy}
                onClick={() => setOpen(false)}
                className="text-fg1 hover:bg-bg2 cursor-pointer rounded p-2"
              >
                <i className="bi-x-lg icon-lg" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <SegmentedControl
                label={t('records.captureMode')}
                value={mode}
                onChange={(value) => {
                  setMode(value);
                  setError('');
                  setDuplicateId(undefined);
                }}
                options={['url', 'text', 'manual'].map((value) => ({
                  value,
                  label: t('records.capture.' + value),
                  disabled: busy,
                }))}
              />
              {error && (
                <p role="alert" className="text-red-bright">
                  {error}
                </p>
              )}
              {duplicateId ? (
                <Link
                  className="text-accent underline"
                  to={`/job-leads/${duplicateId}`}
                >
                  {t('Open saved lead')}
                </Link>
              ) : (
                <>
                  {mode === 'manual' ? (
                    <>
                      <label className="text-muted block text-sm">
                        {t('records.position')}
                        <input
                          required
                          maxLength={255}
                          className={recordInput}
                          value={title}
                          disabled={busy}
                          onChange={(event) => setTitle(event.target.value)}
                        />
                      </label>
                      <div>
                        <label
                          htmlFor="lead-company"
                          className="text-muted mb-1 block text-sm"
                        >
                          {t('records.company')}
                        </label>
                        <CompanyPicker
                          id="lead-company"
                          value={companyId}
                          name={company}
                          disabled={busy}
                          onChange={(id, name) => {
                            setCompanyId(id);
                            setCompany(name);
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label className="text-muted block text-sm">
                          {t('records.location')}
                          <input
                            className={recordInput}
                            value={location}
                            maxLength={255}
                            disabled={busy}
                            onChange={(event) =>
                              setLocation(event.target.value)
                            }
                          />
                        </label>
                        <div>
                          <label
                            htmlFor="lead-work-mode"
                            className="text-muted mb-1 block text-sm"
                          >
                            {t('records.work_mode')}
                          </label>
                          <Dropdown
                            id="lead-work-mode"
                            value={workMode || ''}
                            disabled={busy}
                            options={[
                              { value: '', label: t('records.unspecified') },
                              ...workModes.map((value) => ({
                                value,
                                label: t('records.' + value),
                              })),
                            ]}
                            onChange={(value) =>
                              setWorkMode((value || null) as WorkMode | null)
                            }
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="block text-sm">
                        {t(mode === 'url' ? 'Job URL' : 'records.urlOptional')}
                        <input
                          className="bg-bg2 text-fg1 focus:ring-accent-bright mt-1 w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                          type="url"
                          required={mode === 'url'}
                          value={url}
                          onChange={(event) => setUrl(event.target.value)}
                          disabled={busy}
                        />
                      </label>
                      <label className="block text-sm">
                        {t(
                          mode === 'text'
                            ? 'records.postingText'
                            : 'Job description (optional)'
                        )}
                        <textarea
                          className="bg-bg2 text-fg1 focus:ring-accent-bright mt-1 w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                          rows={5}
                          required={mode === 'text'}
                          value={text}
                          onChange={(event) => setText(event.target.value)}
                          disabled={busy}
                        />
                      </label>
                      {Array.from(text).length > 100000 && (
                        <p role="alert" className="text-red">
                          {t('records.sourceLimit')}
                        </p>
                      )}
                    </>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="text-fg1 hover:bg-bg2 rounded px-4 py-2"
                      disabled={busy}
                      onClick={() => setOpen(false)}
                    >
                      {t('Cancel')}
                    </button>
                    <button
                      className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
                      disabled={
                        busy ||
                        (mode !== 'manual' && Array.from(text).length > 100000)
                      }
                    >
                      {busy ? t('Saving…') : t('Save Lead')}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
