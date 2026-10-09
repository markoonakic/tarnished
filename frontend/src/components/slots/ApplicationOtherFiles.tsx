import { formatDate } from '@/lib/displayDate';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import HelpTip from '../HelpTip';
import { apiV030, type Attachment, type AttachmentKind } from '@/lib/apiV030';
import { errorMessage } from '@/lib/errorMessage';

import type { Application } from '@/lib/types';
import Dropdown from '../Dropdown';
import Modal from '../Modal';
import { recordAction, recordInput } from '@/lib/records';

export default function ApplicationOtherFiles({
  application,
  onUpdated,
}: {
  application: Application;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<Attachment[]>([]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AttachmentKind>('other');
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    apiV030
      .attachments(application.id)
      .then((data) => {
        if (current) {
          setFiles(data);
          setError('');
        }
      })
      .catch(() => {
        if (current) setError(t('records.filesFailed'));
      });
    return () => {
      current = false;
    };
  }, [application.id, t]);
  const colors = {
    portfolio: 'bg-blue/15 text-blue',
    task: 'bg-purple/15 text-purple',
    solution: 'bg-green/15 text-green',
    other: 'bg-bg3 text-muted',
  };
  return (
    <section className="border-tertiary mt-5 border-t pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-muted flex items-center gap-2 text-sm">
          {t('records.otherFiles')}{' '}
          <HelpTip label={t('records.otherFiles')}>
            {t('records.filesNotAi')}
          </HelpTip>
        </h3>
        <button
          className={recordAction}
          disabled={busy}
          onClick={() => {
            setOpen(true);
            setKind('other');
            setFile(undefined);
            setError('');
          }}
        >
          <i className="bi-plus mr-1" aria-hidden="true" />
          {t('records.addFile')}
        </button>
      </div>
      {files.length ? (
        <ul className="space-y-2">
          {files.map((item) => (
            <li
              key={item.id}
              className="bg-bg2 flex flex-wrap items-center gap-2 rounded px-3 py-2"
            >
              <span
                className={`rounded px-2 py-0.5 text-xs ${colors[item.kind]}`}
              >
                {t('records.file.' + item.kind)}
              </span>
              <span className="text-primary min-w-32 flex-1 text-sm break-words">
                {item.original_filename}
              </span>
              <span className="text-muted text-xs">
                {Math.ceil(item.byte_count / 1024)} KB ·{' '}
                {formatDate(item.uploaded_at)}
              </span>
              <div className="flex shrink-0 gap-1">
                <button
                  className={recordAction}
                  disabled={busy}
                  aria-label={t('records.downloadFile', {
                    name: item.original_filename,
                  })}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const blob = await apiV030.downloadAttachment(item.id);
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = item.original_filename;
                      link.click();
                      URL.revokeObjectURL(url);
                    } catch (error) {
                      setError(errorMessage(error));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  title={t('records.downloadFile', {
                    name: item.original_filename,
                  })}
                >
                  <i className="bi-download" aria-hidden="true" />
                </button>
                <button
                  className={recordAction + ' text-red'}
                  disabled={busy}
                  aria-label={t('records.deleteFile', {
                    name: item.original_filename,
                  })}
                  onClick={async () => {
                    if (
                      !confirm(
                        t('records.confirmDeleteFile', {
                          name: item.original_filename,
                        })
                      )
                    )
                      return;
                    setBusy(true);
                    setError('');
                    try {
                      await apiV030.deleteAttachment(item.id);
                      setFiles((items) =>
                        items.filter((file) => file.id !== item.id)
                      );
                      onUpdated?.();
                    } catch (error) {
                      setError(errorMessage(error));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  title={t('records.deleteFile', {
                    name: item.original_filename,
                  })}
                >
                  <i className="bi-trash" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted text-sm">{t('records.noFiles')}</p>
      )}
      {error && !open && (
        <p role="alert" className="text-red mt-2 text-sm">
          {error}
        </p>
      )}

      {open && (
        <Modal
          onClose={() => setOpen(false)}
          label={t('records.addFile')}
          busy={busy}
        >
          <form
            className="bg-secondary mx-4 w-full max-w-lg space-y-4 rounded-lg p-6"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!file || busy) return;
              setBusy(true);
              setError('');
              try {
                const saved = await apiV030.uploadAttachment(
                  application.id,
                  kind,
                  file
                );
                setFiles((items) => [...items, saved]);
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
              {t('records.addFile')}
            </h2>
            <label
              htmlFor="attachment-kind"
              className="text-muted block text-sm"
            >
              {t('records.fileKind')}
            </label>
            <Dropdown
              id="attachment-kind"
              value={kind}
              disabled={busy}
              options={(
                ['portfolio', 'task', 'solution', 'other'] as const
              ).map((value) => ({ value, label: t('records.file.' + value) }))}
              onChange={(value) => setKind(value as AttachmentKind)}
            />
            <label className="text-muted block text-sm">
              {t('records.file')}
              <input
                type="file"
                className={recordInput}
                required
                disabled={busy}
                onChange={(event) => setFile(event.target.files?.[0])}
              />
            </label>
            {error && (
              <p role="alert" className="text-red text-sm">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={recordAction}
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                <i className="bi-x-lg icon-sm" aria-hidden="true" />
                {t('Cancel')}
              </button>
              <button
                className="bg-accent text-bg0 hover:bg-accent-bright focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                disabled={busy || !file}
              >
                <i className="bi-arrow-right icon-sm" aria-hidden="true" />
                {t('records.upload')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
