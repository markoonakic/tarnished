import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { JobFields } from '@/lib/apiV030';
import { apiV030 } from '@/lib/apiV030';
import { errorMessage } from '@/lib/errorMessage';
import Modal from '../Modal';
import TagInput from '../TagInput';
import Dropdown from '../Dropdown';
import { priorities, recordAction } from '@/lib/records';

export default function RecordTags({
  record,
  type,
  revision,
  onUpdated,
}: {
  record: JobFields & { id: string };
  type: 'lead' | 'application';
  revision: number;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState(record.tags || []);
  const [draftRevision, setDraftRevision] = useState(revision);
  const [priority, setPriority] = useState(record.priority || 'normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function edit() {
    setTags(record.tags || []);
    setDraftRevision(revision);
    setPriority(record.priority || 'normal');
    setError('');
    setOpen(true);
  }
  return (
    <div className="mt-2 mb-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={edit}
        className={`hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 ${record.priority === 'high' ? 'text-orange' : 'text-fg1'}`}
      >
        <i className="bi-flag mr-1" aria-hidden="true" />
        {t('records.' + (record.priority || 'normal'))}
      </button>
      {(record.tags || []).map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={edit}
          className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
        >
          <i className="bi-arrow-right icon-sm" aria-hidden="true" />
          {tag}
        </button>
      ))}
      <button
        type="button"
        onClick={edit}
        className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
      >
        <i className="bi-plus-lg icon-sm" aria-hidden="true" />
        {t('records.addTag')}
      </button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          label={t('records.priorityTags')}
          busy={busy}
        >
          <form
            className="bg-secondary mx-4 w-full max-w-lg space-y-4 rounded-lg p-6"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setError('');
              try {
                const data = {
                  priority,
                  tags,
                  expected_revision: draftRevision,
                };
                if (type === 'lead') await apiV030.updateLead(record.id, data);
                else await apiV030.updateApplication(record.id, data);
                setOpen(false);
                onUpdated?.();
              } catch (error) {
                setError(errorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="text-primary text-lg font-semibold">
              {t('records.priorityTags')}
            </h2>
            <label
              htmlFor="record-priority"
              className="text-muted block text-sm"
            >
              {t('records.priority')}
            </label>
            <Dropdown
              id="record-priority"
              disabled={busy}
              value={priority}
              options={priorities.map((value) => ({
                value,
                label: t('records.' + value),
              }))}
              onChange={(value) => setPriority(value as typeof priority)}
            />
            <TagInput
              disabled={busy}
              label={t('records.tags')}
              value={tags}
              onChange={setTags}
            />
            {error && (
              <p role="alert" className="text-red text-sm">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                className={recordAction}
                onClick={() => setOpen(false)}
              >
                <i className="bi-x-lg icon-sm" aria-hidden="true" />
                {t('Cancel')}
              </button>
              <button
                disabled={busy}
                className="bg-accent text-bg0 hover:bg-accent-bright focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
              >
                <i className="bi-check2 icon-sm" aria-hidden="true" />
                {t('Save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
