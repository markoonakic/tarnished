import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { historyInstant } from '@/lib/historyDateTime';
import { roundTypeLabel } from '@/lib/referenceLabels';
import { useTranslation } from 'react-i18next';
import FileButton from './FileButton';
import HelpTip from './HelpTip';
import SearchableCombobox from './SearchableCombobox';
import InterviewParticipants from './InterviewParticipants';
import type { InterviewInput } from '@/lib/apiV030';
import { observeRead } from '../lib/queryClient';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { isAxiosError } from 'axios';
import { errorMessage } from '@/lib/errorMessage';
import { useUserPreferences } from '../hooks/useUserPreferences';
import {
  getEffectiveTimeZone,
  parseRoundDateTime,
  formatRoundDateTimeForApi,
} from '../lib/roundDateTime';
import {
  createRound,
  updateRound,
  uploadRoundTranscript,
  uploadMedia,
} from '../lib/rounds';
import { pasteTranscript } from '../lib/transcripts';
import { listRoundTypes } from '../lib/settings';
import type { Round, RoundType, RoundCreate, RoundUpdate } from '../lib/types';
import Dropdown from './Dropdown';
import ProgressBar from './ProgressBar';

interface Props {
  applicationId: string;
  round?: Round | null;
  onSave: (savedRound: Round) => void;
  onCancel: () => void;
  onPersist: (savedRound: Round) => void;
}

export default function RoundForm(props: Props) {
  useTranslation();
  const preferences = useUserPreferences();
  if (!preferences.data) {
    return (
      <div role="status">
        {preferences.isError
          ? t('Failed to load time zone preferences. Reopen the form to retry.')
          : t('Loading time zone preferences...')}
        <Button
          type="button"

          onClick={props.onCancel}
        >
          {t('Cancel')}
        </Button>
      </div>
    );
  }
  const timeZone = getEffectiveTimeZone(preferences.data);
  if (!timeZone)
    return (
      <div role="alert">
        {t('Set a time zone in Settings before editing round dates.')}
        <Button
          type="button"

          onClick={props.onCancel}
        >
          {t('Cancel')}
        </Button>
      </div>
    );
  return (
    <RoundFormFields
      {...props}
      timeZone={timeZone}
      onTimeZoneConflict={() => {
        void preferences.refetch();
      }}
    />
  );
}

function RoundFormFields({
  applicationId,
  round,
  onSave,
  onCancel,
  onPersist,
  timeZone: preferenceZone,
  onTimeZoneConflict,
}: Props & { timeZone: string; onTimeZoneConflict: () => void }) {
  useTranslation();
  const [interviewZone, setInterviewZone] = useState(round?.time_zone ?? '');
  const timeZone = interviewZone || preferenceZone;
  const [duration, setDuration] = useState(
    String(round?.duration_minutes ?? '')
  );
  const [mode, setMode] = useState<InterviewInput['mode']>(
    round?.mode ?? 'video'
  );
  const [where, setWhere] = useState(
    round?.mode === 'video' ? round.meeting_url || '' : round?.location || ''
  );
  const [participants, setParticipants] = useState(round?.contact_ids ?? []);
  const extra = {
    time_zone: timeZone,
    duration_minutes: duration ? Number(duration) : null,
    mode,
    location: mode === 'video' ? null : where || null,
    meeting_url: mode === 'video' ? where || null : null,
    contact_ids: participants,
  };
  const isEditing = Boolean(round);
  const [roundTypes, setRoundTypes] = useState<RoundType[]>([]);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [transcriptGeneration, setTranscriptGeneration] = useState(
    round?.transcript_generation ?? 0
  );
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const [persistedRound, setPersistedRound] = useState<Round | null>(null);
  const [dateTimeBaseline, setDateTimeBaseline] = useState(() => ({
    timeZone,
    scheduled: parseRoundDateTime(round?.scheduled_at ?? null, timeZone),
    completed: parseRoundDateTime(round?.completed_at ?? null, timeZone),
  }));
  const timeZoneChanged = timeZone !== dateTimeBaseline.timeZone;

  const [roundTypeId, setRoundTypeId] = useState(round?.round_type.id || '');
  const [scheduledDate, setScheduledDate] = useState(
    dateTimeBaseline.scheduled.date
  );
  const [scheduledTime, setScheduledTime] = useState(
    dateTimeBaseline.scheduled.time
  );
  const [completedDate, setCompletedDate] = useState(
    dateTimeBaseline.completed.date
  );
  const [completedTime, setCompletedTime] = useState(
    dateTimeBaseline.completed.time
  );
  const [outcome, setOutcome] = useState(round?.outcome || '');
  const [notesSummary, setNotesSummary] = useState(round?.notes_summary || '');
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptFormat, setTranscriptFormat] = useState<
    'txt' | 'srt' | 'vtt'
  >('txt');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [uploadingName, setUploadingName] = useState('');
  const [transcriptSummary, setTranscriptSummary] = useState(
    round?.transcript_summary || ''
  );
  const pendingTranscript = Boolean(transcriptFile || transcriptText.trim());
  useUnsavedChanges(loading || pendingTranscript || mediaFiles.length > 0);
  const currentRound = persistedRound || round;
  const hasTranscript = Boolean(
    currentRound?.has_current_transcript || currentRound?.transcript_path
  );

  function clearTranscript() {
    setTranscriptFile(null);
    setTranscriptText('');
    setTranscriptOpen(false);
  }

  const loadRoundTypes = useCallback(async () => {
    try {
      const data = await listRoundTypes();
      setRoundTypes(data);
      setError((current) =>
        current === 'Failed to load round types' ? '' : current
      );
      if (!isEditing && data.length > 0) {
        const defaultType = data.find((t) => t.is_default) || data[0];
        setRoundTypeId(defaultType.id);
      }
    } catch (error) {
      setError(t('Failed to load round types'));
      return { error };
    }
  }, [isEditing]);

  useEffect(
    () => observeRead(loadRoundTypes, { staleTime: Infinity }),
    [loadRoundTypes]
  );

  function reloadDates() {
    const savedRound = persistedRound || round;
    const scheduled = parseRoundDateTime(
      savedRound?.scheduled_at ?? null,
      timeZone
    );
    const completed = parseRoundDateTime(
      savedRound?.completed_at ?? null,
      timeZone
    );
    setDateTimeBaseline({ timeZone, scheduled, completed });
    setScheduledDate(scheduled.date);
    setScheduledTime(scheduled.time);
    setCompletedDate(completed.date);
    setCompletedTime(completed.time);
  }

  function roundInstant(date: string, time: string) {
    const local = formatRoundDateTimeForApi(date, time);
    return local ? historyInstant(local, timeZone, 'earlier') : null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (timeZoneChanged || submitting.current) return;
    if (!roundTypeId) {
      setError(t('Please select a round type'));
      return;
    }

    if (
      pendingTranscript &&
      hasTranscript &&
      !confirm(t('Replace the current transcript and discard its corrections?'))
    )
      return;
    submitting.current = true;
    setLoading(true);
    setError('');

    try {
      let savedRound: Round;
      const existingRound = persistedRound || round;
      if (existingRound) {
        const data: RoundUpdate = {
          ...extra,
          expected_revision: existingRound.revision,
          expected_transcript_generation: pendingTranscript
            ? transcriptGeneration
            : undefined,
          round_type_id: roundTypeId,
          scheduled_at:
            scheduledDate === dateTimeBaseline.scheduled.date &&
            scheduledTime === dateTimeBaseline.scheduled.time
              ? undefined
              : roundInstant(scheduledDate, scheduledTime),
          completed_at:
            completedDate === dateTimeBaseline.completed.date &&
            completedTime === dateTimeBaseline.completed.time
              ? undefined
              : roundInstant(completedDate, completedTime),
          outcome: outcome || null,
          notes_summary: notesSummary || null,
          transcript_summary: transcriptSummary || null,
        };
        savedRound = await updateRound(
          existingRound.id,
          data,
          dateTimeBaseline.timeZone
        );
      } else {
        const data: RoundCreate = {
          ...extra,
          round_type_id: roundTypeId,
          scheduled_at: roundInstant(scheduledDate, scheduledTime) ?? undefined,
          notes_summary: notesSummary || undefined,
          transcript_summary: transcriptSummary || undefined,
        };
        savedRound = await createRound(
          applicationId,
          data,
          dateTimeBaseline.timeZone,
          requestKey
        );
      }

      setPersistedRound(savedRound);
      // Compare retries with the submitted controls, including a blank optional time.
      setDateTimeBaseline({
        timeZone,
        scheduled: { date: scheduledDate, time: scheduledTime },
        completed: { date: completedDate, time: completedTime },
      });
      onPersist(savedRound);

      if (pendingTranscript) {
        setUploadProgress(0);
        setUploadingName(transcriptFile?.name || t('Transcript text'));
        try {
          if (transcriptFile) {
            savedRound = await uploadRoundTranscript(
              savedRound.id,
              transcriptFile,
              (loaded, total) =>
                setUploadProgress(
                  total > 0 ? Math.round((loaded / total) * 100) : 0
                ),
              transcriptGeneration
            );
          } else {
            const transcript = await pasteTranscript(
              savedRound.id,
              transcriptGeneration,
              transcriptText,
              transcriptFormat
            );
            savedRound = {
              ...savedRound,
              has_current_transcript: true,
              transcript_generation: transcript.generation,
            };
          }
          setTranscriptGeneration(
            savedRound.transcript_generation ?? transcriptGeneration + 1
          );
          clearTranscript();
          setPersistedRound(savedRound);
          onPersist(savedRound);
        } catch (error) {
          const detail = isAxiosError(error)
            ? error.response?.data?.detail
            : null;
          setError(
            typeof detail === 'string'
              ? `${t('Round saved, but transcript upload failed.')} ${detail}`
              : t('Round saved, but transcript upload failed.')
          );
          return;
        } finally {
          setUploadProgress(0);
          setUploadingName('');
        }
      }

      // One recording at a time, each against the generation the last upload returned.
      for (const file of mediaFiles) {
        setUploadProgress(0);
        setUploadingName(file.name);
        try {
          savedRound = await uploadMedia(
            savedRound.id,
            file,
            (loaded, total) =>
              setUploadProgress(
                total > 0 ? Math.round((loaded / total) * 100) : 0
              ),
            savedRound.media_generation ?? 0
          );
          setMediaFiles((files) => files.filter((item) => item !== file));
          setPersistedRound(savedRound);
          onPersist(savedRound);
        } catch (error) {
          const detail = isAxiosError(error)
            ? error.response?.data?.detail
            : null;
          setError(
            `${t('Round saved, but recording upload failed.')} ${file.name}${
              typeof detail === 'string' ? `: ${detail}` : ''
            }`
          );
          return;
        } finally {
          setUploadProgress(0);
          setUploadingName('');
        }
      }
      onSave(savedRound);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        onTimeZoneConflict();
      }
      const detail = isAxiosError(error) ? error.response?.data?.detail : null;
      setError(
        isAxiosError(error) && error.response
          ? errorMessage(error.response.data, error.response.status)
          : typeof detail === 'string'
            ? t(detail)
            : error instanceof Error
              ? error.message
              : t('Failed to save round. Please check your inputs.')
      );
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  const labelClass = 'text-muted mb-1 block text-sm font-semibold';
  const fieldClass =
    'bg-bg3 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 text-sm transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none';
  const pendingUploads = pendingTranscript || mediaFiles.length > 0;

  return (
    <form onSubmit={handleSubmit} className="bg-bg2 rounded-lg p-4">
      <h3 className="text-primary mb-4 font-medium">
        {round ? t('Edit Round') : t('New Round')}
      </h3>

      {timeZoneChanged && (
        <div role="alert" className="text-muted mb-4 text-sm">
          {t('Your time zone changed to')} {timeZone}
          {t(
            '. Before saving, reload saved dates in this zone. This discards unsaved date/time edits only; other edits and any saved round are kept.'
          )}
          <Button type="button" disabled={loading} onClick={reloadDates}>
            <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
            {t('Reload saved dates in')} {timeZone}
          </Button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="bg-red-bright/20 border-red-bright text-red-bright mb-4 rounded border px-3 py-2 text-sm"
        >
          {error}
        </div>
      )}

      <fieldset
        disabled={loading}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div>
          <label htmlFor="round-type" className={labelClass}>
            {t('Round Type')}
          </label>
          <Dropdown
            id="round-type"
            options={[
              { value: '', label: t('Select type') },
              ...roundTypes.map((type) => ({
                value: type.id,
                label: roundTypeLabel(type),
              })),
            ]}
            value={roundTypeId}
            onChange={(value) => setRoundTypeId(value)}
            placeholder={t('Select type')}
            containerBackground="bg2"
          />
        </div>

        <div>
          <span className="mb-1 flex h-5 items-center gap-1">
            <label
              htmlFor="scheduled-date"
              className="text-muted text-sm font-semibold"
            >
              {t('Scheduled Date')}
            </label>
            <HelpTip label={t('Clock changes')}>
              {t('Dates and times use')} {dateTimeBaseline.timeZone}.{' '}
              {t(
                'During a repeated daylight-saving hour, an edited time uses the first occurrence.'
              )}
            </HelpTip>
          </span>
          <input
            id="scheduled-date"
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="scheduled-time" className={labelClass}>
            {t('Time (optional)')}
          </label>
          <input
            id="scheduled-time"
            type="text"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            placeholder={t('e.g. 2:30 PM')}
            className={fieldClass}
          />
        </div>

        {round ? (
          <div>
            <label htmlFor="round-outcome" className={labelClass}>
              {t('Outcome')}
            </label>
            <Dropdown
              id="round-outcome"
              options={[
                { value: '', label: t('Pending') },
                { value: 'passed', label: t('Passed') },
                { value: 'failed', label: t('Failed') },
                { value: 'cancelled', label: t('Cancelled') },
              ]}
              value={outcome}
              onChange={(value) => setOutcome(value)}
              placeholder={t('Pending')}
              containerBackground="bg2"
            />
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}

        {round && (
          <>
            <div>
              <label htmlFor="completed-date" className={labelClass}>
                {t('Completed Date')}
              </label>
              <input
                id="completed-date"
                type="date"
                value={completedDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="completed-time" className={labelClass}>
                {t('Time (optional)')}
              </label>
              <input
                id="completed-time"
                type="text"
                value={completedTime}
                onChange={(e) => setCompletedTime(e.target.value)}
                placeholder={t('e.g. 2:30 PM')}
                className={fieldClass}
              />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="round-notes" className={labelClass}>
            {t('Notes')}
          </label>
          <textarea
            id="round-notes"
            value={notesSummary}
            onChange={(e) => setNotesSummary(e.target.value)}
            rows={3}
            placeholder={t('Key points, questions asked, feedback...')}
            className={`${fieldClass} resize-y`}
          />
        </div>
      </fieldset>

      <fieldset
        disabled={loading}
        className="border-tertiary mt-4 grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2"
      >
        <legend className="sr-only">{t('tasks.interviewDetails')}</legend>
        <p className="text-muted text-sm sm:col-span-2" aria-hidden="true">
          {t('tasks.interviewDetails')}
        </p>
        <div>
          <label htmlFor="interview-zone" className={labelClass}>
            {t('tasks.timeZone')}
          </label>
          <SearchableCombobox
            id="interview-zone"
            value={timeZone}
            onChange={setInterviewZone}
            containerBackground="bg2"
            options={[
              ...new Set([
                timeZone,
                preferenceZone,
                ...Intl.supportedValuesOf('timeZone'),
              ]),
            ].map((value) => ({ value, label: value }))}
          />
        </div>
        <div>
          <label htmlFor="interview-duration" className={labelClass}>
            {t('tasks.durationMinutes')}
          </label>
          <input
            id="interview-duration"
            type="number"
            min="1"
            max="1440"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="interview-mode" className={labelClass}>
            {t('tasks.mode')}
          </label>
          <Dropdown
            id="interview-mode"
            value={mode || ''}
            onChange={(value) => setMode(value as InterviewInput['mode'])}
            options={['onsite', 'video', 'phone', 'other'].map((value) => ({
              value,
              label: t('tasks.mode.' + value),
            }))}
            containerBackground="bg2"
          />
        </div>
        <div>
          <label htmlFor="interview-where" className={labelClass}>
            {t(mode === 'video' ? 'tasks.meetingLink' : 'tasks.location')}
          </label>
          <input
            id="interview-where"
            type={mode === 'video' ? 'url' : 'text'}
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="sm:col-span-2">
          <span className={labelClass}>{t('tasks.participants')}</span>
          <InterviewParticipants
            containerBackground="bg2"
            value={participants}
            onChange={setParticipants}
          />
        </div>
      </fieldset>

      {/* Same layout as the Media Files part of the round card; files upload on save. */}
      <fieldset
        disabled={loading}
        className="border-tertiary mt-4 border-t pt-3"
      >
        <legend className="sr-only">{t('Media Files')}</legend>
        <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <span className="text-muted flex items-center gap-2 text-sm">
            {t('Media Files')}{' '}
            <HelpTip label={t('Media Files')}>
              {t('Audio or video · up to 1 GB / 2 hours')}
            </HelpTip>
          </span>
          <FileButton
            variant="primary"
            accept=".mp4,.webm,.mov,.mp3,.m4a,.wav,.ogg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset the chooser so the same file can be picked again after removal.
              e.target.value = '';
              if (!file) return;
              if (file.size > 1_000_000_000) {
                setError(
                  t(
                    'Recording exceeds 1,000,000,000 bytes. Choose a smaller recording.'
                  )
                );
                return;
              }
              setError('');
              setMediaFiles((files) => [...files, file]);
            }}
            className="flex items-center gap-1.5"
          >
            <i className="bi-plus-circle icon-sm"></i>
            {t('Add Media')}
          </FileButton>
        </div>
        {(currentRound?.media.length ?? 0) + mediaFiles.length > 0 ? (
          <div className="space-y-2">
            {currentRound?.media.map((m) => (
              <MediaRow
                key={m.id}
                name={m.original_filename || m.file_path.split('/').pop() || ''}
                video={m.media_type === 'video'}
                bytes={m.byte_count ?? null}
              />
            ))}
            {mediaFiles.map((file, index) => (
              <MediaRow
                key={`${file.name}-${index}`}
                name={file.name}
                video={file.type.startsWith('video/')}
                bytes={file.size}
                uploading={uploadingName === file.name}
                progress={uploadProgress}
                onRemove={() =>
                  setMediaFiles((files) => files.filter((f) => f !== file))
                }
              />
            ))}
          </div>
        ) : (
          <p className="text-muted text-sm">{t('No media files')}</p>
        )}
      </fieldset>

      {/* Same layout as the transcript part of the round card. */}
      <fieldset
        disabled={loading}
        className="border-tertiary mt-3 border-t pt-3"
      >
        <legend className="sr-only">{t('Add transcript')}</legend>
        {!transcriptOpen && (
          <p className="text-muted mb-2 text-sm">
            {currentRound?.has_current_transcript
              ? t('Editable transcript available')
              : currentRound?.transcript_path
                ? t('Transcript attachment available')
                : t('No transcript yet')}
          </p>
        )}
        {!transcriptOpen ? (
          <Button
            variant="primary"
            type="button"
            onClick={() => setTranscriptOpen(true)}
            className="flex items-center gap-1.5"
          >
            <i className="bi-plus-lg icon-sm" aria-hidden="true" />
            {hasTranscript ? t('Replace transcript') : t('Add transcript')}
          </Button>
        ) : (
          <div className="space-y-3">
            {transcriptFile ? (
              <div className="bg-bg3 flex min-w-0 items-center justify-between gap-2 rounded px-3 py-3">
                <span className="flex min-w-0 items-center gap-2">
                  <i className="bi-file-text icon-md text-red-bright flex-shrink-0" />
                  <span className="text-primary truncate text-sm">
                    {transcriptFile.name}
                  </span>
                </span>
                {uploadingName === transcriptFile.name &&
                  uploadProgress > 0 &&
                  uploadProgress < 100 && (
                    <ProgressBar
                      progress={uploadProgress}
                      fileName={transcriptFile.name}
                    />
                  )}
              </div>
            ) : (
              <>
                <div className="sm:w-48">
                  <label
                    htmlFor="round-transcript-format"
                    className={labelClass}
                  >
                    {t('Transcript format')}
                  </label>
                  <Dropdown
                    id="round-transcript-format"
                    value={transcriptFormat}
                    onChange={(value) =>
                      setTranscriptFormat(value as typeof transcriptFormat)
                    }
                    options={['txt', 'srt', 'vtt'].map((value) => ({
                      value,
                      label: value.toUpperCase(),
                    }))}
                    containerBackground="bg2"
                  />
                </div>
                <div>
                  <label htmlFor="round-transcript-text" className={labelClass}>
                    {t('Transcript text')}
                  </label>
                  <textarea
                    id="round-transcript-text"
                    maxLength={2000000}
                    value={transcriptText}
                    onChange={(e) => setTranscriptText(e.target.value)}
                    rows={5}
                    className={`${fieldClass} resize-y`}
                  />
                </div>
              </>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!transcriptText.trim() && (
                <FileButton
                  accept=".pdf,.docx,.doc,.txt,.md,.rtf,.srt,.vtt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) {
                      if (
                        !/\.(txt|srt|vtt|pdf|docx?|md|rtf)$/i.test(file.name)
                      ) {
                        setError(
                          t(
                            'Unsupported transcript file. Choose TXT, SRT, VTT, PDF, DOCX, DOC, MD or RTF.'
                          )
                        );
                        return;
                      }
                      setError('');
                      setTranscriptFile(file);
                    }
                  }}
                  className="flex items-center gap-1.5"
                >
                  <i className="bi-upload icon-sm" aria-hidden="true" />
                  {t('Choose transcript file')}
                </FileButton>
              )}
              <Button
                variant="danger"
                type="button"
                onClick={clearTranscript}
                className="flex items-center gap-1.5"
              >
                <i className="bi-x-lg icon-sm" aria-hidden="true" />
                {t('Remove')}
              </Button>
            </div>
          </div>
        )}
        <div className="mt-4">
          <label htmlFor="transcript-summary" className={labelClass}>
            {t('Transcript Summary')}
          </label>
          <textarea
            id="transcript-summary"
            value={transcriptSummary}
            onChange={(e) => setTranscriptSummary(e.target.value)}
            rows={3}
            placeholder={t(
              'Summary of key discussion points from transcript...'
            )}
            className={`${fieldClass} resize-y`}
          />
        </div>
      </fieldset>

      {loading && uploadingName && (
        <p role="status" className="text-muted mt-4 text-sm">
          {t('Uploading...')} {uploadingName}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          disabled={loading}
          onClick={() => (persistedRound ? onSave(persistedRound) : onCancel())}
          className="flex items-center gap-1.5"
        >
          <i className="bi-x-lg icon-sm" aria-hidden="true" />
          {persistedRound ? t('Close (round saved)') : t('Cancel')}
        </Button>
        <Button
          variant="primary"
          type="submit"
          disabled={loading || timeZoneChanged}
        >
          {loading
            ? t('Saving...')
            : persistedRound && pendingUploads
              ? t('Retry save and upload')
              : isEditing || persistedRound
                ? t('Save')
                : t('Add Round')}
        </Button>
      </div>
    </form>
  );
}

function MediaRow({
  name,
  video,
  bytes,
  uploading = false,
  progress = 0,
  onRemove,
}: {
  name: string;
  video: boolean;
  bytes: number | null;
  uploading?: boolean;
  progress?: number;
  onRemove?: () => void;
}) {
  useTranslation();
  return (
    <div className="bg-bg3 space-y-2 rounded px-3 py-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {video ? (
            <i className="bi-camera-video icon-md text-purple-bright flex-shrink-0" />
          ) : (
            <i className="bi-music-note-beamed icon-md text-orange-bright flex-shrink-0" />
          )}
          <span className="text-primary truncate text-sm">{name}</span>
        </span>
        {onRemove && !uploading && (
          <Button
            variant="danger"
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1.5"
          >
            <i className="bi-x-lg icon-sm" aria-hidden="true" />
            {t('Remove')}
          </Button>
        )}
      </div>
      {bytes != null && (
        <p className="text-muted text-xs">
          {`${(bytes / 1_000_000).toFixed(1)} MB`}
        </p>
      )}
      {uploading && progress > 0 && progress < 100 && (
        <ProgressBar progress={progress} fileName={name} />
      )}
    </div>
  );
}
