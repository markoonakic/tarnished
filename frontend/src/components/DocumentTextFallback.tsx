import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
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
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<TextState | null>(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Saving text…');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const explicitReload = useRef(false);
  const dirtyRef = useRef(false);
  const readGeneration = useRef(0);
  const label = kind === 'cv' ? 'CV' : 'Cover letter';
  const path = `/api/applications/${applicationId}/documents/${kind}/text`;
  useEffect(() => {
    let alive = true;
    const generation = ++readGeneration.current;
    const explicit = explicitReload.current;
    explicitReload.current = false;
    api
      .get<TextState>(path)
      .then((response) => {
        if (!alive || generation !== readGeneration.current) return;
        if (dirtyRef.current && !explicit) {
          setError(
            'This document changed while you were editing. Your draft is kept. Refresh the saved text before saving.'
          );
        } else {
          setSaved(response.data);
          setError('');
        }
        if (!dirtyRef.current) setDraft(response.data.text);
      })
      .catch(() => {
        if (alive && generation === readGeneration.current)
          setError('Cannot load saved document text. Your draft is kept.');
      });
    return () => {
      alive = false;
    };
    // Draft edits never cause reads or get overwritten by background updates.
  }, [path, revision, reload]);
  async function save(text: string) {
    if (!saved) return;
    ++readGeneration.current;
    setBusyLabel(text ? 'Saving text…' : 'Clearing saved text…');
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
      setNotice(text ? 'Document text saved.' : 'Saved document text cleared.');
      onSaved?.(response.data.revision);
    } catch (err) {
      setError(
        safeErrorMessage(
          isAxiosError(err) ? err.response?.data?.detail : null,
          'Document text was not saved. Your draft is kept. Refresh the saved text before trying again.'
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Use ${label} text`}
        title="Paste text instead of a file"
        className="text-fg1 hover:bg-bg2 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-all duration-200 ease-in-out"
      >
        <i className="bi-file-text icon-sm" aria-hidden="true" />
        Use text
      </button>
      {open && (
        <Modal label={`${label} text`} onClose={close} busy={busy}>
          <div className="bg-bg1 mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-primary text-xl font-semibold">
                {label} text
              </h2>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                aria-label="Close document text"
                className="text-fg1 hover:bg-bg2 cursor-pointer rounded p-2"
              >
                <i className="bi-x-lg icon-lg" aria-hidden="true" />
              </button>
            </div>
            <p className="text-muted my-2 text-sm">
              Paste text if you do not have a file or its text cannot be read.
              Feedback uses this text instead of the attachment. Replacing the
              attachment clears saved text.
            </p>
            {!saved && !error && <p role="status">Loading saved text…</p>}
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
              {label} pasted text
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
            {dirty && (
              <p className="text-muted text-sm">
                Unsaved document draft; not sent for analysis.
              </p>
            )}
            <button
              type="button"
              className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !saved}
              onClick={() => void save(draft)}
            >
              Save {label} text
            </button>
            <button
              type="button"
              className="text-fg1 hover:bg-bg2 cursor-pointer rounded px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                explicitReload.current = true;
                setReload((n) => n + 1);
              }}
            >
              Refresh saved {label} text (keep draft)
            </button>
            <button
              type="button"
              className="text-red hover:bg-bg2 hover:text-red-bright cursor-pointer rounded px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !saved?.text}
              onClick={() => {
                if (
                  confirm(`Clear saved ${label} text and dependent feedback?`)
                )
                  void save('');
              }}
            >
              Clear saved {label} text
            </button>
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
