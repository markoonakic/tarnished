import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiV030, type InterviewInput } from '@/lib/apiV030';
import { listRoundTypes } from '@/lib/settings';
import { roundTypeLabel } from '@/lib/referenceLabels';
import { parseRoundDateTime, getEffectiveTimeZone } from '@/lib/roundDateTime';
import { historyInstant } from '@/lib/historyDateTime';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { invalidateEvidenceQueries } from '@/lib/queryClient';
import type { Round } from '@/lib/types';
import Dropdown from './Dropdown';
import SearchableCombobox from './SearchableCombobox';
import InterviewParticipants from './InterviewParticipants';

interface Props {
  applicationId: string;
  round?: Round | null;
  onSave: (saved: Round) => void;
  onCancel: () => void;
  onPersist: (saved: Round) => void;
}
export default function RoundForm(props: Props) {
  const { t } = useTranslation();
  const preferences = useUserPreferences();
  const zone = preferences.data ? getEffectiveTimeZone(preferences.data) : null;
  return zone ? (
    <RoundFields {...props} userZone={zone} />
  ) : (
    <p role="status">
      {preferences.isError ? t('tasks.loadFailed') : t('tasks.loading')}{' '}
      <button
        className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
        onClick={props.onCancel}
      >
        <i className="bi-x-lg icon-sm" aria-hidden="true" />
        {t('Cancel')}
      </button>
    </p>
  );
}
function RoundFields({
  applicationId,
  round: currentRound,
  onSave,
  onPersist,
  onCancel,
  userZone,
}: Props & { userZone: string }) {
  const { t } = useTranslation();
  const [round] = useState(currentRound);
  const types = useQuery({
    queryKey: ['round-types'],
    queryFn: listRoundTypes,
  });
  const [zone, setZone] = useState(round?.time_zone || userZone);
  const initial = parseRoundDateTime(
    round?.scheduled_at ?? null,
    round?.time_zone || userZone
  );
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time || '09:00');
  const [type, setType] = useState(round?.round_type.id ?? '');
  const typeId =
    type ||
    types.data?.find((r) => r.is_default)?.id ||
    types.data?.[0]?.id ||
    '';
  const [duration, setDuration] = useState(
    String(round?.duration_minutes ?? '')
  );
  const [mode, setMode] = useState<NonNullable<InterviewInput['mode']>>(
    round?.mode || 'video'
  );
  const [where, setWhere] = useState(
    round?.mode === 'video' ? round.meeting_url || '' : round?.location || ''
  );
  const [participants, setParticipants] = useState(round?.contact_ids ?? []);
  const [outcome, setOutcome] = useState(round?.outcome || 'pending');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input =
    'bg-bg3 text-primary focus:ring-accent w-full rounded px-3 py-2 text-sm focus:ring-2 focus:outline-none';
  const zones = [
    ...new Set([zone, userZone, ...Intl.supportedValuesOf('timeZone')]),
  ];
  return (
    <form
      className="bg-bg2 rounded-lg p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !typeId) return;
        setBusy(true);
        setError('');
        try {
          const unchanged =
            round &&
            date === initial.date &&
            time === (initial.time || '09:00') &&
            zone === (round.time_zone || userZone);
          const data: InterviewInput = {
            round_type_id: typeId,
            time_zone: zone,
            duration_minutes: duration ? Number(duration) : null,
            mode,
            location: mode === 'video' ? null : where || null,
            meeting_url: mode === 'video' ? where || null : null,
            contact_ids: participants,
            outcome: outcome === 'pending' ? null : outcome,
            scheduled_at: unchanged
              ? undefined
              : date
                ? historyInstant(`${date}T${time}`, zone)
                : null,
          };
          const saved = round
            ? await apiV030.updateInterview(round.id, {
                ...data,
                expected_revision: round.revision ?? 0,
              })
            : await apiV030.createInterview(applicationId, data);
          invalidateEvidenceQueries();
          onPersist(saved as Round);
          onSave(saved as Round);
        } catch (error) {
          setError(
            error instanceof Error ? error.message : t('tasks.saveFailed')
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="text-primary mb-4 font-medium">
        {t(round ? 'Edit Round' : 'New Round')}
      </h3>
      <fieldset
        disabled={busy}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div>
          <label className="text-muted mb-1 block text-sm" htmlFor="round-type">
            {t('Round Type')}
          </label>
          <Dropdown
            id="round-type"
            value={typeId}
            onChange={setType}
            options={
              types.data?.map((r) => ({
                value: r.id,
                label: roundTypeLabel(r),
              })) ?? []
            }
          />
        </div>
        <div>
          <label
            className="text-muted mb-1 block text-sm"
            htmlFor="scheduled-date"
          >
            {t('Scheduled Date')}
          </label>
          <input
            id="scheduled-date"
            className={input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label
            className="text-muted mb-1 block text-sm"
            htmlFor="scheduled-time"
          >
            {t('tasks.time')}
          </label>
          <input
            id="scheduled-time"
            className={input}
            type="time"
            value={time}
            required={Boolean(date)}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <div>
          <label
            className="text-muted mb-1 block text-sm"
            htmlFor="interview-zone"
          >
            {t('tasks.timeZone')}
          </label>
          <SearchableCombobox
            id="interview-zone"
            value={zone}
            onChange={setZone}
            options={zones.map((z) => ({ value: z, label: z }))}
          />
        </div>
        <div>
          <label
            className="text-muted mb-1 block text-sm"
            htmlFor="interview-duration"
          >
            {t('tasks.durationMinutes')}
          </label>
          <input
            id="interview-duration"
            className={input}
            type="number"
            min="1"
            max="1440"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
        <div>
          <label
            className="text-muted mb-1 block text-sm"
            htmlFor="interview-mode"
          >
            {t('tasks.mode')}
          </label>
          <Dropdown
            id="interview-mode"
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
            options={['onsite', 'video', 'phone', 'other'].map((v) => ({
              value: v,
              label: t('tasks.mode.' + v),
            }))}
          />
        </div>
        <div className="sm:col-span-2">
          <label
            className="text-muted mb-1 block text-sm"
            htmlFor="interview-where"
          >
            {t(mode === 'video' ? 'tasks.meetingLink' : 'tasks.location')}
          </label>
          <input
            id="interview-where"
            type={mode === 'video' ? 'url' : 'text'}
            className={input}
            value={where}
            onChange={(e) => setWhere(e.target.value)}
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
        <div>
          <label
            className="text-muted mb-1 block text-sm"
            htmlFor="round-outcome"
          >
            {t('Outcome')}
          </label>
          <Dropdown
            id="round-outcome"
            value={outcome}
            onChange={setOutcome}
            options={[
              'pending',
              'passed',
              'failed',
              'cancelled',
              'withdrew',
            ].map((v) => ({ value: v, label: t('tasks.outcome.' + v) }))}
          />
        </div>
      </fieldset>
      {(error || types.isError) && (
        <p role="alert" className="text-red-bright mt-4 text-sm">
          {error || t('tasks.loadFailed')}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
        >
          <i className="bi-x-lg icon-sm" aria-hidden="true" />
          {t('Cancel')}
        </button>
        <button
          disabled={busy || !typeId}
          className="bg-accent text-bg0 hover:bg-accent-bright focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
        >
          <i className="bi-check2 icon-sm" aria-hidden="true" />
          {t(round ? 'Save' : 'Add Round')}
        </button>
      </div>
    </form>
  );
}
