import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import Dropdown from './Dropdown';
import HelpTip from './HelpTip';
import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import Modal from './Modal';
import { observeRead } from '../lib/queryClient';
import FileButton from './FileButton';
import { safeErrorMessage, API_BASE } from '../lib/api';
import {
  deleteRoundTranscript,
  getRoundTranscriptSignedUrl,
  uploadRoundTranscript,
} from '../lib/rounds';
import {
  editTranscript,
  getTranscript,
  pasteTranscript,
  type TranscriptSegment,
  type TranscriptState,
} from '../lib/transcripts';

function getApiErrorMessage(error: unknown, fallback: string) {
  return safeErrorMessage(
    isAxiosError(error) ? error.response?.data?.detail : null,
    fallback
  );
}

const roleLabels = {
  get interviewer() {
    return t('Interviewer');
  },
  get candidate() {
    return t('Candidate');
  },
  get other() {
    return t('Other');
  },
  get unknown() {
    return t('Unknown');
  },
};

function timeRange(segment: TranscriptSegment) {
  const time = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return segment.start !== null && segment.end !== null
    ? `${time(segment.start)}–${time(segment.end)}`
    : t('Timing unknown');
}

export default function TranscriptEditor({
  roundId,
  citedSegmentId,
  onClose,
  onChange,
  onFeedback,
  returnToFeedback = false,
}: {
  roundId: string;
  citedSegmentId?: string;
  onClose: () => void;
  onChange: () => void;
  onFeedback?: () => void;
  returnToFeedback?: boolean;
}) {
  useTranslation();
  const [saved, setSaved] = useState<TranscriptState | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [text, setText] = useState('');
  const [format, setFormat] = useState<'txt' | 'srt' | 'vtt'>('txt');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState<'save' | 'upload' | 'delete'>(
    'save'
  );
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  useUnsavedChanges(dirty || busy);

  useEffect(() => {
    let active = true;
    const stop = observeRead(
      () =>
        getTranscript(roundId)
          .then((data) => {
            if (!active) return;
            setSaved(data);
            setSegments(data.transcript?.segments ?? []);
            setError('');
          })
          .catch((err: unknown) => {
            if (active)
              setError(getApiErrorMessage(err, t('Failed to load transcript')));
            return { error: err };
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      { staleTime: Infinity }
    );
    return () => {
      active = false;
      stop();
    };
  }, [roundId, retry]);

  useEffect(() => {
    if (!loading && citedSegmentId) {
      document.getElementById(`transcript-segment-${citedSegmentId}`)?.focus();
    }
  }, [loading, citedSegmentId]);

  function close() {
    if (!dirty || confirm(t('Discard unsaved transcript changes?'))) onClose();
  }

  async function mutate(
    operation: () => Promise<TranscriptState>,
    replace = true,
    action: 'save' | 'upload' | 'delete' = 'save'
  ) {
    setOperation(action);
    setBusy(true);
    setError('');
    setSavedNotice('');
    try {
      const data = await operation();
      setSaved(data);
      setSegments(data.transcript?.segments ?? []);
      if (replace) {
        setText('');
        setFile(null);
      }
      setDirty(!replace && Boolean(text || file));
      setSavedNotice(
        action === 'delete' ? t('Transcript deleted.') : t('Transcript saved.')
      );
      if (replace || !(text || file)) setEditing(false);
      onChange();
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          t('Transcript could not be saved. Your draft is retained.')
        )
      );
    } finally {
      setBusy(false);
    }
  }

  function change(index: number, value: Partial<TranscriptSegment>) {
    setSegments((current) =>
      current.map((segment, i) =>
        i === index ? { ...segment, ...value } : segment
      )
    );
    setDirty(true);
    setSavedNotice('');
  }

  return (
    <Modal label={t('Interview transcript')} onClose={close} busy={busy}>
      <section className="bg-bg1 mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-primary text-xl font-semibold">
            {t('Interview transcript')}
          </h2>
          <Button type="button" onClick={close} disabled={busy}>
            {returnToFeedback ? t('Back to feedback') : t('Close')}
          </Button>
        </div>
        <HelpTip label={t('Supported transcript files')}>
          {t(
            'Read the transcript or request feedback. You can edit the transcript if needed.'
          )}{' '}
          {t(
            'English UTF-8 TXT, SRT or VTT, up to 2 MB. Subtitle times must be within two hours. Timing is kept when supplied.'
          )}
        </HelpTip>
        {savedNotice && (
          <p role="status" className="text-green mb-3 text-sm">
            {savedNotice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-red-bright mb-4">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">{t('Loading transcript…')}</p>
        ) : !saved ? (
          <Button
            type="button"

            onClick={() => {
              setError('');
              setLoading(true);
              setRetry((n) => n + 1);
            }}
          >
            {t('Retry loading')}
          </Button>
        ) : (
          <>
            {saved.transcript && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(!editing)}
                >
                  {editing ? t('Read transcript') : t('Edit transcript')}
                </Button>
                {onFeedback && !returnToFeedback && (
                  <Button
                    variant="primary"
                    type="button"
                    disabled={busy || dirty}
                    onClick={onFeedback}
                  >
                    {returnToFeedback
                      ? t('Back to feedback')
                      : t('Interview feedback')}
                  </Button>
                )}
                {dirty && (
                  <span className="text-muted text-sm">
                    {t('Unsaved changes. Save before requesting feedback.')}
                  </span>
                )}
              </div>
            )}
            {citedSegmentId &&
              !saved.transcript?.segments.some(
                (segment) => segment.id === citedSegmentId
              ) && (
                <p role="status" className="text-yellow-bright mb-3 text-sm">
                  {t(
                    'This passage is no longer in the current transcript. Review the changes, then update the feedback.'
                  )}
                </p>
              )}
            {saved.transcript?.structure === 'automatic' && (
              <HelpTip label={t('Interview transcript')}>
                {t(
                  'Parts and roles were assigned automatically. Edit only if something is wrong.'
                )}
              </HelpTip>
            )}
            {saved.transcript?.structure_status && (
              <p role="status" className="text-muted mb-3 text-sm">
                {saved.transcript.structure_status}
                <HelpTip label={t('Correct text and speaker roles')}>
                  {t(
                    '. The transcript is saved. You can assign roles in Edit transcript.'
                  )}
                </HelpTip>
              </p>
            )}
            {(saved.attachment_only ||
              saved.transcript?.provenance === 'upload') && (
              <div className="mb-3 flex items-center gap-2">
                <HelpTip label={t('Supported transcript files')}>
                  {saved.attachment_only
                    ? t(
                        'An existing document is stored as an attachment, not editable text. Paste or upload TXT/SRT/VTT to replace it.'
                      )
                    : t(
                        'The original upload is retained separately from your corrections.'
                      )}
                </HelpTip>
                <Button
                  type="button"
                  disabled={busy}

                  onClick={async () => {
                    try {
                      const { url } = await getRoundTranscriptSignedUrl(
                        roundId,
                        'attachment'
                      );
                      window.open(
                        `${API_BASE}${url}`,
                        '_blank',
                        'noopener,noreferrer'
                      );
                    } catch (err) {
                      setError(
                        getApiErrorMessage(
                          err,
                          t('Failed to download attachment')
                        )
                      );
                    }
                  }}
                >
                  {saved.attachment_only
                    ? t('Download attachment')
                    : t('Download original upload')}
                </Button>
              </div>
            )}
            {saved.transcript && !editing && (
              <div className="space-y-3">
                {segments.map((segment, index) => (
                  <article
                    key={segment.id}
                    id={`transcript-segment-${segment.id}`}
                    tabIndex={-1}
                    className={`bg-bg2 rounded-lg p-4 ${citedSegmentId === segment.id ? 'ring-accent ring-1' : ''}`}
                  >
                    <p className="text-muted mb-2 text-xs">
                      {roleLabels[segment.role]}
                      {segment.speaker && ` · ${segment.speaker}`}
                      {` · ${timeRange(segment)}`}
                      {segment.start === null &&
                        t(' · Passage {{value0}}', { value0: index + 1 })}
                    </p>
                    <p className="text-fg1 whitespace-pre-wrap">
                      {segment.text}
                    </p>
                  </article>
                ))}
                {segments.some((segment) => segment.role === 'unknown') && (
                  <HelpTip label={t('Correct text and speaker roles')}>
                    {t(
                      'Some speakers are unidentified. Identify your answers in Edit transcript for personal feedback.'
                    )}
                  </HelpTip>
                )}
              </div>
            )}
            {saved.transcript
              ? editing && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void mutate(
                        () =>
                          editTranscript(roundId, saved.generation, segments),
                        false
                      );
                    }}
                  >
                    <fieldset disabled={busy} className="space-y-4">
                      <legend className="text-primary mb-2 font-medium">
                        {t('Correct text and speaker roles')}
                      </legend>
                      {segments.map((segment, index) => (
                        <div
                          key={segment.id}
                          id={`transcript-segment-${segment.id}`}
                          tabIndex={-1}
                          className="bg-bg2 rounded p-3"
                        >
                          <p className="text-muted text-sm">
                            {t('Passage')} {index + 1} ·{' '}
                            {segment.audio_channel &&
                              `${segment.audio_channel} · `}{' '}
                            {timeRange(segment)}
                          </p>
                          <label className="block">
                            {t('Text for passage')} {index + 1}
                            <textarea
                              required
                              maxLength={64000}
                              className="bg-bg3 text-fg1 focus:ring-accent-bright mt-1 block w-full rounded px-3 py-2 focus:ring-1 focus:outline-none"
                              rows={3}
                              value={segment.text}
                              onChange={(event) =>
                                change(index, { text: event.target.value })
                              }
                            />
                          </label>
                          <div className="mt-2 flex flex-wrap gap-3">
                            <label>
                              {t('Speaker for passage')} {index + 1}
                              <input
                                maxLength={100}
                                className="bg-bg3 text-fg1 focus:ring-accent-bright block rounded px-3 py-2 focus:ring-1 focus:outline-none"
                                placeholder={t('Unknown')}
                                value={segment.speaker ?? ''}
                                onChange={(event) =>
                                  change(index, {
                                    speaker: event.target.value || null,
                                  })
                                }
                              />
                            </label>
                            <label>
                              {t('Role for passage')} {index + 1}
                              <Dropdown
                                id={`segment-role-${index}`}
                                value={segment.role}
                                onChange={(value) =>
                                  change(index, {
                                    role: value as TranscriptSegment['role'],
                                  })
                                }
                                options={[
                                  'unknown',
                                  'candidate',
                                  'interviewer',
                                  'other',
                                ].map((value) => ({
                                  value,
                                  label: t(
                                    value[0].toUpperCase() + value.slice(1)
                                  ),
                                }))}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                      <Button variant="primary" type="submit">
                        {t('Save corrections')}
                      </Button>
                    </fieldset>
                  </form>
                )
              : !saved.attachment_only && (
                  <p className="mb-4">{t('No transcript yet.')}</p>
                )}
            <details
              open={(!saved.transcript && !saved.attachment_only) || undefined}
              className="border-tertiary mt-6 border-t pt-4"
            >
              <summary className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded px-3 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out">
                {saved.transcript || saved.attachment_only
                  ? t('Replace transcript')
                  : t('Add transcript')}
              </summary>
              <form
                className="mt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    (saved.transcript || saved.attachment_only) &&
                    !confirm(
                      t(
                        'Replace the current transcript and discard its corrections?'
                      )
                    )
                  )
                    return;
                  void mutate(() =>
                    pasteTranscript(roundId, saved.generation, text, format)
                  );
                }}
              >
                <fieldset disabled={busy}>
                  <legend className="text-primary mb-2 font-medium">
                    {t('Paste')}{' '}
                    {saved.transcript || saved.attachment_only
                      ? t('replacement')
                      : t('transcript')}
                  </legend>
                  <label>
                    {t('Transcript format')}
                    <Dropdown
                      id="transcript-format"
                      value={format}
                      onChange={(value) => {
                        setFormat(value as typeof format);
                        setDirty(true);
                      }}
                      options={['txt', 'srt', 'vtt'].map((value) => ({
                        value,
                        label: value.toUpperCase(),
                      }))}
                    />
                  </label>
                  <label className="mt-2 block">
                    {t('Transcript text')}
                    <textarea
                      required
                      maxLength={2000000}
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value);
                        setDirty(true);
                      }}
                      className="bg-bg2 text-fg1 focus:ring-accent-bright mt-1 block w-full rounded px-3 py-2 focus:ring-1 focus:outline-none"
                      rows={5}
                    />
                  </label>
                  <Button variant="primary" type="submit" className="mt-2">
                    {t('Save pasted transcript')}
                  </Button>
                </fieldset>
              </form>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <FileButton
                  accept=".txt,.srt,.vtt"
                  disabled={busy}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setDirty(true);
                  }}
                >
                  {t('Choose transcript file')}
                </FileButton>
                {file && (
                  <>
                    <span>{file.name}</span>
                    <Button
                      variant="primary"
                      type="button"
                      disabled={busy}

                      onClick={() => {
                        if (
                          (saved.transcript || saved.attachment_only) &&
                          !confirm(
                            t(
                              'Replace the current transcript and discard its corrections?'
                            )
                          )
                        )
                          return;
                        void mutate(
                          async () => {
                            await uploadRoundTranscript(
                              roundId,
                              file,
                              undefined,
                              saved.generation
                            );
                            return getTranscript(roundId);
                          },
                          true,
                          'upload'
                        );
                      }}
                    >
                      {t('Upload transcript')}
                    </Button>
                  </>
                )}
              </div>
            </details>
            <details className="text-muted mt-4 text-sm">
              <summary className="hover:bg-bg2 hover:text-fg0 cursor-pointer rounded px-3 py-1.5 transition-all duration-200 ease-in-out">
                {t('Transcript actions')}
              </summary>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={busy}

                  onClick={() => {
                    if (
                      !confirm(
                        t(
                          'Reload current transcript and discard unsaved changes?'
                        )
                      )
                    )
                      return;
                    setDirty(false);
                    setSaved(null);
                    setText('');
                    setFile(null);
                    setLoading(true);
                    setError('');
                    setRetry((n) => n + 1);
                  }}
                >
                  {t('Reload current transcript')}
                </Button>
                {(saved.transcript || saved.attachment_only) && (
                  <Button
                    variant="danger"
                    type="button"
                    disabled={busy}

                    onClick={() => {
                      if (
                        !confirm(
                          t(
                            'Delete the transcript, its corrections and original attachment?'
                          )
                        )
                      )
                        return;
                      void mutate(
                        async () => {
                          await deleteRoundTranscript(
                            roundId,
                            saved.generation
                          );
                          return {
                            generation: saved.generation + 1,
                            transcript: null,
                            attachment_only: false,
                          };
                        },
                        true,
                        'delete'
                      );
                    }}
                  >
                    {t('Delete transcript')}
                  </Button>
                )}
              </div>
            </details>
          </>
        )}
        {busy && (
          <p role="status" className="mt-3">
            {operation === 'delete'
              ? t('Deleting transcript…')
              : operation === 'upload'
                ? t('Uploading transcript…')
                : t('Saving transcript…')}
          </p>
        )}
      </section>
    </Modal>
  );
}
