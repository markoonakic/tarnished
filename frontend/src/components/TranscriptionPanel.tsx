import { t } from '@/lib/i18n';
import { errorMessage } from '@/lib/errorMessage';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { observeRead } from '../lib/queryClient';
import api, { safeErrorMessage } from '../lib/api';
import { isAxiosError } from 'axios';
import { getAICapabilities, type Capability } from '../lib/aiSettings';
import type { Round } from '../lib/types';

interface Job {
  id: string;
  media_id: string;
  state: string;
  stage: string;
  completed_chunks: number;
  uncertain: boolean;
  error: string | null;
  error_code?: string | null;
  provider: string;
  model: string;
  coverage: { track: number; channel: number; start: number; end: number }[];
}
const active = (job: Job) =>
  ['queued', 'preparing', 'transcribing'].includes(job.state);

export default function TranscriptionPanel({
  round,
  onChange,
  onResult,
  initialMediaId = '',
}: {
  round: Round;
  onChange: () => void;
  onResult: () => void;
  initialMediaId?: string;
}) {
  useTranslation();
  const [speech, setSpeech] = useState<Capability | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [mediaId, setMediaId] = useState(initialMediaId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const submitting = useRef(false);
  const observedActive = useRef(false);
  const selectedId = round.media.some((media) => media.id === mediaId)
    ? mediaId
    : round.media[0]?.id;
  const intents = useRef<Record<string, string>>({});
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  useEffect(() => {
    intents.current = {};
    observedActive.current = false;
  }, [round.id]);
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [capabilities, response] = await Promise.all([
          getAICapabilities(),
          api.get<Job[]>(`/api/rounds/${round.id}/transcriptions`),
        ]);
        if (!alive) return;
        setSpeech(capabilities.speech);
        setJobs(response.data);
        setError('');
        const running = response.data.some(active);
        if (observedActive.current && !running) callback.current();
        observedActive.current = running;
      } catch (error) {
        if (alive)
          setError(
            t(
              'Cannot load transcription status. Try loading again before requesting work.'
            )
          );
        return { error };
      }
    }
    const stop = observeRead(load, {
      refetchInterval: () => (observedActive.current ? 1000 : false),
    });
    return () => {
      alive = false;
      stop();
    };
  }, [round.id, round.media_generation, round.transcript_generation, reload]);

  const activeJob = jobs.find(active);
  const selectedJob = jobs.find((job) => job.media_id === selectedId);
  const shownJob = activeJob ?? selectedJob;
  const retryJob =
    !activeJob &&
    selectedJob &&
    ['failed', 'interrupted'].includes(selectedJob.state)
      ? selectedJob
      : undefined;
  const activeName =
    round.media.find((media) => media.id === activeJob?.media_id)
      ?.original_filename || t('another recording');

  async function request(job?: Job) {
    if (
      submitting.current ||
      !speech?.available ||
      activeJob ||
      error ||
      (!job && !selectedId)
    )
      return;
    if (
      job &&
      !confirm(
        t(
          'Retry transcription? The service may already have processed part of this recording. Another attempt may repeat work or charges; matching completed parts may be reused.'
        )
      )
    )
      return;
    if (
      !job &&
      (round.has_current_transcript || round.transcript_path) &&
      !confirm(
        t(
          'Replace the saved transcript and its corrections only if full transcription succeeds? Later saved edits prevent replacement. Unsaved edits are not sent.'
        )
      )
    )
      return;
    const key = job?.id ?? selectedId!;
    const intent = intents.current[key] ?? crypto.randomUUID();
    intents.current[key] = intent;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await api.post<Job>(
        job
          ? `/api/transcriptions/${job.id}/retry`
          : `/api/rounds/${round.id}/media/${selectedId}/transcription`,
        null,
        {
          headers: {
            'Request-Intent': intent,
            'Expected-Transcript-Generation': round.transcript_generation ?? 0,
            'Speech-Configuration-Revision': speech.configuration_revision,
          },
        }
      );
      if (response.data?.id && response.data?.state) {
        delete intents.current[key];
        setJobs((current) => [
          response.data,
          ...current.filter((item) => item.id !== response.data.id),
        ]);
        observedActive.current = active(response.data);
        if (response.data.state === 'complete') callback.current();
      }
      setReload((n) => n + 1);
    } catch (error) {
      setError(
        safeErrorMessage(
          isAxiosError(error) ? error.response?.data?.detail : null,
          t(
            'The request outcome is not confirmed. Try loading status again before retrying; work may have started.'
          )
        )
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const mainLabel = retryJob
    ? t('Retry transcription')
    : round.has_current_transcript || round.transcript_path
      ? t('Transcribe again')
      : t('Start transcription');
  return (
    <section className="space-y-3" aria-label={t('Recording transcription')}>
      {speech ? (
        <p className="text-muted text-sm">
          {speech.provider === 'local'
            ? t(
                'Audio is processed by the local speech service on this server.'
              )
            : t(
                'Audio is sent to the configured speech service. Charges may apply.'
              )}{' '}
          {t(
            'The transcript is then sent to the configured text analysis service to assign parts and roles automatically. Charges may apply.'
          )}
        </p>
      ) : (
        !error && <p role="status">{t('Loading speech service…')}</p>
      )}
      {round.media.length > 1 && (
        <label className="block text-sm">
          {t('Recording to transcribe')}
          <select
            className="bg-bg2 text-fg1 focus:ring-accent-bright mt-1 w-full rounded px-3 py-2 focus:ring-1 focus:outline-none"
            value={selectedId || ''}
            disabled={busy || !!activeJob}
            onChange={(event) => setMediaId(event.target.value)}
          >
            {round.media.map((media) => (
              <option key={media.id} value={media.id}>
                {media.original_filename || t('Recording')}
              </option>
            ))}
          </select>
        </label>
      )}
      {busy && !activeJob && (
        <p role="status" className="text-fg1">
          <i
            className="bi-arrow-repeat icon-sm mr-2 inline-block animate-spin"
            aria-hidden="true"
          />
          {t('Starting transcription…')}
        </p>
      )}
      {activeJob && (
        <p role="status" className="text-fg1">
          <i
            className="bi-arrow-repeat icon-sm mr-2 inline-block animate-spin"
            aria-hidden="true"
          />
          {activeJob.state === 'queued'
            ? t('Waiting to transcribe {{activeName}}…', {
                activeName: activeName,
              })
            : activeJob.state === 'preparing'
              ? t('Preparing audio from {{activeName}}…', {
                  activeName: activeName,
                })
              : activeJob.stage === 'structuring'
                ? t('Assigning parts and roles for {{activeName}}…', {
                    activeName: activeName,
                  })
                : t('Transcribing {{activeName}}…', {
                    activeName: activeName,
                  })}{' '}
          {t('You can close this panel and return later.')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-bright">
          {error}
        </p>
      )}
      {speech && !speech.available && (
        <p role="status" className="text-muted text-sm">
          {t(
            'Transcription is unavailable. Ask your administrator to check the speech settings.'
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!busy && !activeJob && (
          <button
            type="button"
            className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!speech?.available || !!error || !round.media.length}
            onClick={() => void request(retryJob)}
          >
            {mainLabel}
          </button>
        )}
        {error && (
          <button
            type="button"
            className="text-fg1 hover:bg-bg3 cursor-pointer rounded px-3 py-2"
            disabled={busy}
            onClick={() => {
              setError('');
              setSpeech(null);
              setReload((n) => n + 1);
            }}
          >
            {t('Try loading status again')}
          </button>
        )}
      </div>
      {shownJob && (
        <div className="bg-bg3 space-y-2 rounded p-3 text-sm">
          {!activeJob && (
            <p role="status">
              {shownJob.state === 'complete'
                ? t('Transcript ready')
                : shownJob.state === 'invalidated'
                  ? t(
                      'The recording or transcript changed. Review the current version before starting again.'
                    )
                  : shownJob.state === 'failed'
                    ? t('Could not finish transcription.')
                    : t('Transcription was interrupted.')}
            </p>
          )}
          {shownJob.uncertain && !active(shownJob) && (
            <p>
              {t(
                'The service may already have processed part of this recording. Retrying may repeat work or charges.'
              )}
            </p>
          )}
          {shownJob.error && shownJob.state !== 'invalidated' && (
            <p>
              {shownJob.state === 'complete'
                ? t('Automatic sections unavailable')
                : errorMessage({ code: shownJob.error_code })}
            </p>
          )}
          {shownJob.completed_chunks > 0 && (
            <p className="text-muted">
              {t('audioParts', { count: shownJob.completed_chunks })}
            </p>
          )}
          {shownJob.state === 'complete' && (
            <button
              type="button"
              className="text-accent hover:bg-bg4 cursor-pointer rounded px-3 py-2"
              onClick={onResult}
            >
              {t('View transcript')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
