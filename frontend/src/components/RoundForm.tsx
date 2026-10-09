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
import { useState, useEffect, useCallback } from 'react';
import { isAxiosError } from 'axios';
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
  const [transcriptGeneration, setTranscriptGeneration] = useState(
    round?.transcript_generation ?? 0
  );
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaGeneration] = useState(round?.media_generation ?? 0);
  const [transcriptSummary, setTranscriptSummary] = useState(
    round?.transcript_summary || ''
  );

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
    if (timeZoneChanged) return;
    if (!roundTypeId) {
      setError(t('Please select a round type'));
      return;
    }

    if (mediaFile && mediaFile.size > 1_000_000_000) {
      setError(
        t(
          'Recording exceeds 1,000,000,000 bytes. Choose a smaller recording; your draft is kept.'
        )
      );
      return;
    }
    setLoading(true);
    setError('');

    try {
      let savedRound: Round;
      const existingRound = persistedRound || round;
      if (existingRound) {
        const data: RoundUpdate = {
          ...extra,
          expected_revision: existingRound.revision,
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
          dateTimeBaseline.timeZone
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

      // Upload transcript if file is selected
      if (transcriptFile) {
        setUploadProgress(0);

        try {
          savedRound = await uploadRoundTranscript(
            savedRound.id,
            transcriptFile,
            (loaded, total) => {
              setUploadProgress(
                total > 0 ? Math.round((loaded / total) * 100) : 0
              );
            },
            transcriptGeneration
          );
          setUploadProgress(0);
          setTranscriptFile(null);
          setTranscriptGeneration(savedRound.transcript_generation ?? 0);
          setPersistedRound(savedRound);
          onPersist(savedRound);
        } catch (error) {
          setUploadProgress(0);
          setError(
            isAxiosError(error) && error.response?.status === 409
              ? t(
                  'Round saved, but transcript upload conflicted. Retrying cannot resolve this conflict. Close and reopen the round, then review the current transcript before selecting a file and saving again.'
                )
              : t(
                  'Round saved, but transcript upload failed. Retry to upload to this same round, or close and keep the saved round.'
                )
          );
          return;
        }
      }

      if (mediaFile) {
        try {
          savedRound = await uploadMedia(
            savedRound.id,
            mediaFile,
            undefined,
            mediaGeneration
          );
          setMediaFile(null);
          setPersistedRound(savedRound);
          onPersist(savedRound);
        } catch (error) {
          const detail = isAxiosError(error)
            ? error.response?.data?.detail
            : null;
          setError(
            isAxiosError(error) && error.response?.status === 409
              ? t(
                  'Round saved, but recordings changed. Retrying cannot resolve this conflict. Close and review recordings before reopening and selecting a file again. Your pending file and draft are kept while this form stays open.'
                )
              : t(
                  'Round saved, but recording upload failed. {{value0}} Retry uses this same round. Selected file and other draft fields are kept.',
                  {
                    value0:
                      typeof detail === 'string'
                        ? detail
                        : t(
                            'Check current recordings before retrying; a lost response may mean the upload succeeded.'
                          ),
                  }
                )
          );
          return;
        }
      }
      onSave(savedRound);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        onTimeZoneConflict();
      }
      const detail = isAxiosError(error) ? error.response?.data?.detail : null;
      setError(
        typeof detail === 'string'
          ? detail
          : error instanceof Error
            ? error.message
            : t('Failed to save round. Please check your inputs.')
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-bg2 rounded-lg p-4">
      <h3 className="text-primary mb-4 font-medium">
        {round ? t('Edit Round') : t('New Round')}
      </h3>

      <HelpTip label={t('Clock changes')}>
        {t('Dates and times use')} {dateTimeBaseline.timeZone}.{' '}
        {t(
          'During a repeated daylight-saving hour, an edited time uses the first occurrence.'
        )}
      </HelpTip>
      {timeZoneChanged && (
        <div role="alert" className="text-muted mb-4 text-sm">
          {t('Your time zone changed to')} {timeZone}
          {t(
            '. Before saving, reload saved dates in this zone. This discards unsaved date/time edits only; other edits and any saved round are kept.'
          )}
          <Button type="button" disabled={loading} onClick={reloadDates}>
            {t('Reload saved dates in')} {timeZone}
          </Button>
        </div>
      )}
      {persistedRound && (
        <p role="status" className="text-muted mb-4 text-sm">
          {t(
            'Round saved. Closing keeps this record; any unsaved changes or pending transcript or recording are not saved.'
          )}
        </p>
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
          <label
            htmlFor="round-type"
            className="text-muted mb-1 block text-sm font-semibold"
          >
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
          <label
            htmlFor="scheduled-date"
            className="text-muted mb-1 block text-sm font-semibold"
          >
            {t('Scheduled Date')}
          </label>
          <input
            id="scheduled-date"
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="bg-bg3 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="scheduled-time"
            className="text-muted mb-1 block text-sm font-semibold"
          >
            {t('Time (optional)')}
          </label>
          <input
            id="scheduled-time"
            type="text"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            placeholder={t('e.g. 2:30 PM')}
            className="bg-bg3 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
          />
        </div>

        {round && (
          <>
            <div>
              <label
                htmlFor="round-outcome"
                className="text-muted mb-1 block text-sm font-semibold"
              >
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

            <div>
              <label
                htmlFor="completed-date"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                {t('Completed Date')}
              </label>
              <input
                id="completed-date"
                type="date"
                value={completedDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                className="bg-bg3 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="completed-time"
                className="text-muted mb-1 block text-sm font-semibold"
              >
                {t('Time (optional)')}
              </label>
              <input
                id="completed-time"
                type="text"
                value={completedTime}
                onChange={(e) => setCompletedTime(e.target.value)}
                placeholder={t('e.g. 2:30 PM')}
                className="bg-bg3 text-fg1 placeholder-muted focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label
            htmlFor="round-notes"
            className="text-muted mb-1 block text-sm font-semibold"
          >
            {t('Notes')}
          </label>
          <textarea
            id="round-notes"
            value={notesSummary}
            onChange={(e) => setNotesSummary(e.target.value)}
            rows={3}
            placeholder={t('Key points, questions asked, feedback...')}
            className="bg-bg3 text-fg1 placeholder-muted focus:ring-accent-bright w-full resize-y rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <span className="text-muted mb-1 block text-sm font-semibold">
            {t('Transcript (TXT/SRT/VTT or document attachment)')}
          </span>
          <FileButton
            accept=".pdf,.docx,.doc,.txt,.md,.rtf,.srt,.vtt"
            onChange={(e) => setTranscriptFile(e.target.files?.[0] || null)}
            className="flex w-fit items-center gap-1.5"
          >
            <i className="bi-upload icon-sm"></i>
            {transcriptFile ? transcriptFile.name : t('Choose transcript...')}
          </FileButton>
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mt-2">
              <ProgressBar
                progress={uploadProgress}
                fileName={transcriptFile?.name}
              />
            </div>
          )}
          {round?.transcript_path && !transcriptFile && (
            <div className="bg-secondary border-tertiary mt-2 flex items-center gap-2 rounded border p-2">
              <i className="bi-file-text icon-md text-red-bright"></i>
              <span className="text-primary truncate text-sm">
                {t('Current:')}{' '}
                {round.transcript_original_filename ||
                  round.transcript_path.split('/').pop()}
              </span>
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <span className="text-muted mb-1 block text-sm font-semibold">
            {t('Recording')}
          </span>
          <HelpTip label={t('Recording')}>
            {t(
              'Audio or video, up to 1 GB and two hours. Uploading does not start transcription; choose Transcribe when ready. MP4/WebM/MOV with audio or MP3/M4A/WAV/OGG.'
            )}
          </HelpTip>
          <FileButton
            accept=".mp4,.webm,.mov,.mp3,.m4a,.wav,.ogg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              // State owns the File, including after a failed save or removal.
              e.target.value = '';
              setMediaFile(file);
            }}
          >
            {mediaFile ? mediaFile.name : t('Choose recording...')}
          </FileButton>
          {mediaFile && (
            <Button type="button" onClick={() => setMediaFile(null)}>
              {t('Remove pending recording')}
            </Button>
          )}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="transcript-summary"
            className="text-muted mb-1 block text-sm font-semibold"
          >
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
            className="bg-bg3 text-fg1 placeholder-muted focus:ring-accent-bright w-full resize-y rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
          />
        </div>
      </fieldset>

      <fieldset
        disabled={loading}
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <legend className="text-fg1 mb-4 text-lg font-semibold">
          {t('tasks.interviewDetails')}
        </legend>
        <div>
          <label
            htmlFor="interview-zone"
            className="text-muted mb-1 block text-sm"
          >
            {t('tasks.timeZone')}
          </label>
          <SearchableCombobox
            id="interview-zone"
            value={timeZone}
            onChange={setInterviewZone}
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
          <label
            htmlFor="interview-duration"
            className="text-muted mb-1 block text-sm"
          >
            {t('tasks.durationMinutes')}
          </label>
          <input
            id="interview-duration"
            type="number"
            min="1"
            max="1440"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="bg-bg3 w-full rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="interview-mode"
            className="text-muted mb-1 block text-sm"
          >
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
          />
        </div>
        <div>
          <label
            htmlFor="interview-where"
            className="text-muted mb-1 block text-sm"
          >
            {t(mode === 'video' ? 'tasks.meetingLink' : 'tasks.location')}
          </label>
          <input
            id="interview-where"
            type={mode === 'video' ? 'url' : 'text'}
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            className="bg-bg3 w-full rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <span className="text-muted mb-1 block text-sm">
            {t('tasks.participants')}
          </span>
          <InterviewParticipants
            value={participants}
            onChange={setParticipants}
          />
        </div>
      </fieldset>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          disabled={loading}
          onClick={() => (persistedRound ? onSave(persistedRound) : onCancel())}
        >
          {persistedRound ? t('Close (round saved)') : t('Cancel')}
        </Button>
        <Button
          variant="primary"
          type="submit"
          disabled={loading || timeZoneChanged}
        >
          {loading
            ? t('Saving...')
            : persistedRound && (transcriptFile || mediaFile)
              ? t('Retry save and upload')
              : isEditing || persistedRound
                ? t('Save')
                : t('Add Round')}
        </Button>
      </div>
    </form>
  );
}
