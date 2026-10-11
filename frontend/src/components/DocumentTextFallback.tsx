import Button from '@/components/ui/Button';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import HelpTip from './HelpTip';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { observeRead } from '../lib/queryClient';
import { isAxiosError } from 'axios';
import api, { safeErrorMessage } from '../lib/api';

interface TextState {
  text: string;
  revision: number;
  message?: string;
}
export default function DocumentTextFallback({
  applicationId,
  kind,
  revision,
  onSaved,
}: {
  applicationId: string;
  kind: 'cv' | 'cover_letter';
  revision: number;
  onSaved?: (revision: number) => void;
}) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<TextState | null>(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState(t('Saving text…'));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const explicitReload = useRef(false);
  const dirtyRef = useRef(false);
  const readGeneration = useRef(0);
  const label = kind === 'cv' ? t('CV') : t('Cover letter');
  const path = `/api/applications/${applicationId}/documents/${kind}/text`;
  useUnsavedChanges(dirty || busy);
  useEffect(() => {
    let alive = true;
    const generation = ++readGeneration.current;
    const explicit = explicitReload.current;
    explicitReload.current = false;
    const stop = observeRead(
      () =>
        api
          .get<TextState>(path)
          .then((response) => {
            if (!alive || generation !== readGeneration.current) return;
            if (dirtyRef.current && !explicit) {
              setError(
                t(
                  'This document changed while you were editing. Your draft is kept. Refresh the saved text before saving.'
                )
              );
            } else {
              setSaved(response.data);
              setError('');
            }
            if (!dirtyRef.current) setDraft(response.data.text);
          })
          .catch((error: unknown) => {
            if (alive && generation === readGeneration.current)
              setError(
                t('Cannot load saved document text. Your draft is kept.')
              );
            return { error };
          }),
      { staleTime: Infinity }
    );
    return () => {
      alive = false;
      stop();
    };
    // Draft edits never cause reads or get overwritten by background updates.
  }, [path, revision, reload]);
  async function save(text: string) {
    if (!saved) return;
    ++readGeneration.current;
    setBusyLabel(text ? t('Saving text…') : t('Clearing saved text…'));
    setNotice('');
    setBusy(true);
    try {
      const response = await api.put<TextState>(path, {
        text,
        expected_revision: saved.revision,
      });
      setSaved(response.data);
      setDraft(response.data.text);
      dirtyRef.current = false;
      setDirty(false);
      setError('');
      setNotice(
        text ? t('Document text saved.') : t('Saved document text cleared.')
      );
      onSaved?.(response.data.revision);
    } catch (err) {
      setError(
        safeErrorMessage(
          isAxiosError(err) ? err.response?.data?.detail : null,
          t(
            'Document text was not saved. Your draft is kept. Refresh the saved text before trying again.'
          )
        )
      );
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (busy) return;
    // Keep the draft in memory if the user closes the dialog.
    setOpen(false);
  }
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('Use {{label}} text', { label: label })}
        title={t('Paste text instead of a file')}
        className="flex items-center gap-1.5"
      >
        <i className="bi-file-text icon-sm" aria-hidden="true" />
        {t('Use text')}
      </Button>
      {open && (
        <Modal
          label={t('{{label}} text', { label: label })}
          onClose={close}
          busy={busy}
        >
          <div className="bg-bg1 mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-primary text-xl font-semibold">
                {t('{{label}} text', { label })}
                <HelpTip label={t('{{label}} text', { label })}>
                  {t(
                    'Paste text if you do not have a file or its text cannot be read. Feedback uses this text instead of the attachment. Replacing the attachment clears saved text.'
                  )}{' '}
                  {t('Unsaved document draft; not sent for analysis.')}
                </HelpTip>
              </h2>
              <Button
                variant="icon"
                type="button"
                onClick={close}
                disabled={busy}
                aria-label={t('Close document text')}
              >
                <i className="bi-x-lg icon-lg" aria-hidden="true" />
              </Button>
            </div>
            {!saved && !error && (
              <p role="status">{t('Loading saved text…')}</p>
            )}
            {busy && (
              <p role="status" className="text-muted text-sm">
                {busyLabel}
              </p>
            )}
            {!busy && notice && (
              <p role="status" className="text-green text-sm">
                {notice}
              </p>
            )}
            <label className="block">
              {t('{{label}} pasted text', { label })}
              <textarea
                className="bg-bg2 text-fg1 focus:ring-accent-bright my-2 block w-full rounded px-3 py-2 focus:ring-1 focus:outline-none"
                rows={6}
                maxLength={32000}
                value={draft}
                disabled={busy}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setNotice('');
                  dirtyRef.current = true;
                  setDirty(true);
                }}
              />
            </label>
            <Button
              variant="primary"
              type="button"

              disabled={busy || !saved}
              onClick={() => void save(draft)}
            >
              {t('Save {{label}} text', { label })}
            </Button>
            <Button
              type="button"

              disabled={busy}
              onClick={() => {
                explicitReload.current = true;
                setReload((n) => n + 1);
              }}
            >
              {t('Refresh saved {{label}} text (keep draft)', { label })}
            </Button>
            <Button
              variant="danger"
              type="button"

              disabled={busy || !saved?.text}
              onClick={() => {
                if (
                  confirm(
                    t('Clear saved {{label}} text and dependent feedback?', {
                      label: label,
                    })
                  )
                )
                  void save('');
              }}
            >
              {t('Clear saved {{label}} text', { label })}
            </Button>
            {error && (
              <p role="alert" className="text-red-bright">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
