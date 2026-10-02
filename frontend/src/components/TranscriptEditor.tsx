import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import Modal from './Modal';
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
  interviewer: 'Interviewer',
  candidate: 'Candidate',
  other: 'Other',
  unknown: 'Unknown',
};

function timeRange(segment: TranscriptSegment) {
  const time = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return segment.start !== null && segment.end !== null
    ? `${time(segment.start)}–${time(segment.end)}`
    : 'Timing unknown';
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

  useEffect(() => {
    let active = true;
    getTranscript(roundId)
      .then((data) => {
        if (!active) return;
        setSaved(data);
        setSegments(data.transcript?.segments ?? []);
      })
      .catch((err: unknown) => {
        if (active)
          setError(getApiErrorMessage(err, 'Failed to load transcript'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [roundId, retry]);

  useEffect(() => {
    if (!loading && citedSegmentId) {
      document.getElementById(`transcript-segment-${citedSegmentId}`)?.focus();
    }
  }, [loading, citedSegmentId]);

  function close() {
    if (!dirty || confirm('Discard unsaved transcript changes?')) onClose();
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
        action === 'delete' ? 'Transcript deleted.' : 'Transcript saved.'
      );
      if (replace || !(text || file)) setEditing(false);
      onChange();
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          'Transcript could not be saved. Your draft is retained.'
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
    <Modal label="Interview transcript" onClose={close} busy={busy}>
      <section className="bg-bg1 mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-primary text-xl font-semibold">
            Interview transcript
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="text-fg1 hover:bg-bg2 cursor-pointer rounded px-3 py-2"
          >
            {returnToFeedback ? 'Back to feedback' : 'Close'}
          </button>
        </div>
        <p className="text-muted mb-4 text-sm">
          Read the transcript or request feedback. You can edit the transcript
          if needed.
        </p>
        <details className="text-muted mb-4 text-sm">
          <summary className="cursor-pointer">
            Supported transcript files
          </summary>
          <p>
            English UTF-8 TXT, SRT or VTT, up to 2 MB. Subtitle times must be
            within two hours. Timing is kept when supplied.
          </p>
        </details>
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
          <p role="status">Loading transcript…</p>
        ) : !saved ? (
          <button
            type="button"
            className="text-fg1 hover:bg-bg2 cursor-pointer rounded px-3 py-2"
            onClick={() => {
              setError('');
              setLoading(true);
              setRetry((n) => n + 1);
            }}
          >
            Retry loading
          </button>
        ) : (
          <>
            {saved.transcript && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(!editing)}
                  className="text-fg1 hover:bg-bg2 cursor-pointer rounded px-3 py-2 transition-all duration-200 ease-in-out"
                >
                  {editing ? 'Read transcript' : 'Edit transcript'}
                </button>
                {onFeedback && !returnToFeedback && (
                  <button
                    type="button"
                    disabled={busy || dirty}
                    onClick={onFeedback}
                    className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded px-4 py-2 transition-all duration-200 ease-in-out disabled:opacity-50"
                  >
                    {returnToFeedback
                      ? 'Back to feedback'
                      : 'Interview feedback'}
                  </button>
                )}
                {dirty && (
                  <span className="text-muted text-sm">
                    Unsaved changes. Save before requesting feedback.
                  </span>
                )}
              </div>
            )}
            {citedSegmentId &&
              !saved.transcript?.segments.some(
                (segment) => segment.id === citedSegmentId
              ) && (
                <p role="status" className="text-yellow-bright mb-3 text-sm">
                  This passage is no longer in the current transcript. Review
                  the changes, then update the feedback.
                </p>
              )}
            {saved.transcript?.structure === 'automatic' && (
              <p className="text-muted mb-3 text-sm">
                Parts and roles were assigned automatically. Edit only if
                something is wrong.
              </p>
            )}
            {saved.transcript?.structure_status && (
              <p role="status" className="text-muted mb-3 text-sm">
                {saved.transcript.structure_status}. The transcript is saved.
                You can assign roles in Edit transcript.
              </p>
            )}
            {(saved.attachment_only ||
              saved.transcript?.provenance === 'upload') && (
              <p className="mb-3">
                {saved.attachment_only
                  ? 'An existing document is stored as an attachment, not editable text. Paste or upload TXT/SRT/VTT to replace it.'
                  : 'The original upload is retained separately from your corrections.'}{' '}
                <button
                  type="button"
                  disabled={busy}
                  className="text-fg1 hover:bg-bg2 cursor-pointer rounded px-3 py-2 transition-colors disabled:opacity-50"
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
                        getApiErrorMessage(err, 'Failed to download attachment')
                      );
                    }
                  }}
                >
                  {saved.attachment_only
                    ? 'Download attachment'
                    : 'Download original upload'}
                </button>
              </p>
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
                      {segment.start === null && ` · Passage ${index + 1}`}
                    </p>
                    <p className="text-fg1 whitespace-pre-wrap">
                      {segment.text}
                    </p>
                  </article>
                ))}
                {segments.some((segment) => segment.role === 'unknown') && (
                  <p className="text-muted text-sm">
                    Some speakers are unidentified. Identify your answers in
                    Edit transcript for personal feedback.
                  </p>
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
                        Correct text and speaker roles
                      </legend>
                      {segments.map((segment, index) => (
                        <div
                          key={segment.id}
                          id={`transcript-segment-${segment.id}`}
                          tabIndex={-1}
                          className="bg-bg2 rounded p-3"
                        >
                          <p className="text-muted text-sm">
                            Passage {index + 1} ·{' '}
                            {segment.audio_channel &&
                              `${segment.audio_channel} · `}{' '}
                            {timeRange(segment)}
                          </p>
                          <label className="block">
                            Text for passage {index + 1}
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
                              Speaker for passage {index + 1}
                              <input
                                maxLength={100}
                                className="bg-bg3 text-fg1 focus:ring-accent-bright block rounded px-3 py-2 focus:ring-1 focus:outline-none"
                                placeholder="Unknown"
                                value={segment.speaker ?? ''}
                                onChange={(event) =>
                                  change(index, {
                                    speaker: event.target.value || null,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Role for passage {index + 1}
                              <select
                                className="bg-bg3 text-fg1 focus:ring-accent-bright block rounded px-3 py-2 focus:ring-1 focus:outline-none"
                                value={segment.role}
                                onChange={(event) =>
                                  change(index, {
                                    role: event.target
                                      .value as TranscriptSegment['role'],
                                  })
                                }
                              >
                                <option value="unknown">Unknown</option>
                                <option value="candidate">Candidate</option>
                                <option value="interviewer">Interviewer</option>
                                <option value="other">Other</option>
                              </select>
                            </label>
                          </div>
                        </div>
                      ))}
                      <button
                        type="submit"
                        className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Save corrections
                      </button>
                    </fieldset>
                  </form>
                )
              : !saved.attachment_only && (
                  <p className="mb-4">No transcript yet.</p>
                )}
            <details
              open={(!saved.transcript && !saved.attachment_only) || undefined}
              className="border-tertiary mt-6 border-t pt-4"
            >
              <summary className="text-fg1 cursor-pointer font-medium">
                {saved.transcript || saved.attachment_only
                  ? 'Replace transcript'
                  : 'Add transcript'}
              </summary>
              <form
                className="mt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    (saved.transcript || saved.attachment_only) &&
                    !confirm(
                      'Replace the current transcript and discard its corrections?'
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
                    Paste{' '}
                    {saved.transcript || saved.attachment_only
                      ? 'replacement'
                      : 'transcript'}
                  </legend>
                  <label>
                    Transcript format
                    <select
                      value={format}
                      onChange={(event) => {
                        setFormat(event.target.value as typeof format);
                        setDirty(true);
                      }}
                      className="bg-bg2 text-fg1 focus:ring-accent-bright mx-2 rounded px-3 py-2 focus:ring-1 focus:outline-none"
                    >
                      <option value="txt">TXT</option>
                      <option value="srt">SRT</option>
                      <option value="vtt">VTT</option>
                    </select>
                  </label>
                  <label className="mt-2 block">
                    Transcript text
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
                  <button
                    type="submit"
                    className="bg-accent text-bg0 hover:bg-accent-bright mt-2 cursor-pointer rounded px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save pasted transcript
                  </button>
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
                  className="text-fg1 hover:bg-bg2 cursor-pointer rounded px-4 py-2 transition-colors disabled:opacity-50"
                >
                  Choose transcript file
                </FileButton>
                {file && (
                  <>
                    <span>{file.name}</span>
                    <button
                      type="button"
                      disabled={busy}
                      className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        if (
                          (saved.transcript || saved.attachment_only) &&
                          !confirm(
                            'Replace the current transcript and discard its corrections?'
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
                      Upload transcript
                    </button>
                  </>
                )}
              </div>
            </details>
            <details className="text-muted mt-4 text-sm">
              <summary className="cursor-pointer">Transcript actions</summary>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  className="text-fg1 hover:bg-bg2 cursor-pointer rounded px-3 py-2 transition-colors disabled:opacity-50"
                  onClick={() => {
                    if (
                      !confirm(
                        'Reload current transcript and discard unsaved changes?'
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
                  Reload current transcript
                </button>
                {(saved.transcript || saved.attachment_only) && (
                  <button
                    type="button"
                    disabled={busy}
                    className="text-red hover:bg-bg2 hover:text-red-bright cursor-pointer rounded px-3 py-2 transition-colors disabled:opacity-50"
                    onClick={() => {
                      if (
                        !confirm(
                          'Delete the transcript, its corrections and original attachment?'
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
                    Delete transcript
                  </button>
                )}
              </div>
            </details>
          </>
        )}
        {busy && (
          <p role="status" className="mt-3">
            {operation === 'delete'
              ? 'Deleting transcript…'
              : operation === 'upload'
                ? 'Uploading transcript…'
                : 'Saving transcript…'}
          </p>
        )}
      </section>
    </Modal>
  );
}
