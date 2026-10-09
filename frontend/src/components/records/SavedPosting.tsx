import Button from '@/components/ui/Button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiV030 } from '@/lib/apiV030';
import { jobLeadError } from '@/lib/jobLeads';
import Modal from '../Modal';
import { recordAction, recordInput } from '@/lib/records';

export default function SavedPosting({
  id,
  type,
  revision,
  text,
  url,
  truncated,
  onUpdated,
}: {
  id: string;
  type: 'lead' | 'application';
  revision: number;
  text?: string | null;
  url?: string | null;
  truncated?: boolean;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftRevision, setDraftRevision] = useState(revision);
  const [fetched, setFetched] = useState(false);
  const [warning, setWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const count = Array.from(draft).length;
  return (
    <section className="bg-bg2 mb-4 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <details className="min-w-0 flex-1">
          <summary className="text-muted hover:bg-bg2 focus:ring-accent cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2">
            <i className="bi-file-text mr-2" aria-hidden="true" />
            {t('records.savedPosting', {
              count: Array.from(text || '').length,
            })}
          </summary>
          {truncated && (
            <p className="text-yellow mt-3 text-sm">
              {t('records.incompleteSource')}
            </p>
          )}
          <pre className="text-primary mt-3 max-h-96 overflow-auto text-sm break-words whitespace-pre-wrap">
            {text || t('records.noSource')}
          </pre>
        </details>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            className={recordAction}
            disabled={busy}
            onClick={() => {
              setDraft(text || '');
              setDraftRevision(revision);
              setFetched(false);
              setError('');
              setWarning(false);
              setOpen(true);
            }}
          >
            <i className="bi-clipboard mr-1" aria-hidden="true" />
            {t('records.replaceText')}
          </Button>
          <Button
            type="button"
            className={recordAction}
            disabled={busy || !url}
            onClick={async () => {
              setBusy(true);
              setDraftRevision(revision);
              setError('');
              try {
                const preview =
                  type === 'lead'
                    ? await apiV030.fetchLeadSource(id)
                    : await apiV030.fetchApplicationSource(id);
                setDraft(preview.text);
                setFetched(true);
                setWarning(preview.truncated || !!preview.warning);
                setOpen(true);
              } catch (error) {
                setError(jobLeadError(error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <i className="bi-cloud-download mr-1" aria-hidden="true" />
            {t('records.fetchSource')}
          </Button>
        </div>
      </div>
      {error && !open && (
        <p role="alert" className="text-red mt-2 text-sm">
          {error}
        </p>
      )}
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          label={t(fetched ? 'records.previewPosting' : 'records.replaceText')}
          busy={busy}
        >
          <form
            className="bg-secondary mx-4 w-full max-w-2xl space-y-4 rounded-lg p-6"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy || count > 100000 || !draft.trim()) return;
              setBusy(true);
              setError('');
              try {
                const data = { text: draft, expected_revision: draftRevision };
                if (type === 'lead') await apiV030.replaceLeadSource(id, data);
                else await apiV030.replaceApplicationSource(id, data);
                setOpen(false);
                onUpdated?.();
              } catch (error) {
                setError(jobLeadError(error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="text-primary text-lg font-semibold">
              {t(fetched ? 'records.previewPosting' : 'records.replaceText')}
            </h2>
            {warning && (
              <p className="text-yellow text-sm">
                {t('records.incompleteSource')}
              </p>
            )}
            <label className="text-muted block text-sm">
              {t('records.postingText')}
              <textarea
                rows={12}
                className={recordInput}
                value={draft}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <p
              className={
                count > 100000 ? 'text-red text-sm' : 'text-muted text-sm'
              }
            >
              {t('records.sourceCount', { count, limit: 100000 })}
            </p>
            {count > 100000 && (
              <p role="alert" className="text-red text-sm">
                {t('records.sourceLimit')}
              </p>
            )}
            {error && (
              <p role="alert" className="text-red text-sm">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                disabled={busy}
                className={recordAction}
                onClick={() => setOpen(false)}
              >
                <i className="bi-x-lg icon-sm" aria-hidden="true" />
                {t('Cancel')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="flex items-center gap-1.5"
                disabled={busy || count > 100000 || !draft.trim()}
              >
                <i className="bi-check2 icon-sm" aria-hidden="true" />
                {t('Save')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
