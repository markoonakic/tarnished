import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createJobLead, jobLeadError } from '../lib/jobLeads';
import { useToast } from '../hooks/useToast';
import Modal from './Modal';

export default function JobLeadCaptureForm({
  onSaved,
}: {
  onSaved?: () => Promise<void>;
}) {
  useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duplicateId, setDuplicateId] = useState<string>();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (Array.from(text).length > 100000 || Array.from(url).length > 2048) {
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
      const lead = await createJobLead({ url, ...(text ? { text } : {}) });
      setOpen(false);
      setUrl('');
      setText('');
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
          <div className="bg-bg1 mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg p-6">
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
              <p className="text-muted text-sm">
                {t(
                  'Save the link now. You can fill in the details yourself or use AI afterwards.'
                )}
              </p>
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
                  <label className="block text-sm">
                    {t('Job URL')}
                    <input
                      className="bg-bg2 text-fg1 focus:ring-accent-bright mt-1 w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                      type="url"
                      required
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label className="block text-sm">
                    {t('Job description (optional)')}
                    <textarea
                      className="bg-bg2 text-fg1 focus:ring-accent-bright mt-1 w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
                      rows={5}
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <button
                    className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
                    disabled={busy}
                  >
                    {busy ? t('Saving…') : t('Save Lead')}
                  </button>
                </>
              )}
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
