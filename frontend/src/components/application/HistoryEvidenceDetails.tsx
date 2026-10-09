import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { isAxiosError } from 'axios';
import {
  correctHistoryEntry,
  getApplicationHistory,
  historyStageLabels,
} from '@/lib/history';
import { getApplication } from '@/lib/applications';
import {
  historyInstant,
  historyLocalTime,
  normalizeHistoryTime,
} from '@/lib/historyDateTime';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { getEffectiveTimeZone } from '@/lib/roundDateTime';
import { safeErrorMessage } from '@/lib/api';
import {
  statusMeanings,
  type ApplicationStatusHistory,
  type HistoryCorrection,
  type StatusMeaning,
} from '@/lib/types';
import Modal from '../Modal';
import Dropdown from '../Dropdown';

interface Props {
  entry: ApplicationStatusHistory;
  applicationId: string;
  revision?: number;
  onChanged?: () => void | Promise<void>;
  editable: boolean;
}
export default function HistoryEvidenceDetails(props: Props) {
  useTranslation();
  const [editing, setEditing] = useState(false);
  const preferences = useUserPreferences({ enabled: editing });
  const timeZone = preferences.data
    ? getEffectiveTimeZone(preferences.data)
    : null;
  if (props.entry.is_gap || !props.editable || props.revision === undefined)
    return null;
  return (
    <>
      <Button type="button" className="mt-2" onClick={() => setEditing(true)}>
        <i className="bi-pencil icon-xs mr-1" aria-hidden="true" />
        {t('Edit event')}
      </Button>
      {editing &&
        (timeZone ? (
          <HistoryCorrectionForm
            {...props}
            revision={props.revision}
            timeZone={timeZone}
            onClose={() => setEditing(false)}
          />
        ) : (
          <Modal
            label={t('Edit history event')}
            onClose={() => setEditing(false)}
          >
            <div className="bg-bg1 mx-4 w-full max-w-lg rounded-lg p-6">
              <p role={preferences.isError ? 'alert' : 'status'}>
                {preferences.isError
                  ? t('Could not load your time zone. Close and try again.')
                  : t('Loading your time zone…')}
              </p>
              <Button
                type="button"
                className="mt-4"
                onClick={() => setEditing(false)}
              >
                {t('Cancel')}
              </Button>
            </div>
          </Modal>
        ))}
    </>
  );
}

function HistoryCorrectionForm({
  entry,
  applicationId,
  revision,
  onChanged,
  timeZone,
  onClose,
}: Props & { revision: number; timeZone: string; onClose: () => void }) {
  useTranslation();
  const [baseline, setBaseline] = useState({ entry, revision, timeZone });
  const [from, setFrom] = useState<StatusMeaning>(
    entry.from_meaning ?? 'unknown'
  );
  const [to, setTo] = useState<StatusMeaning>(entry.to_meaning ?? 'unknown');
  const [when, setWhen] = useState(() =>
    historyLocalTime(entry.changed_at, timeZone)
  );
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [removed, setRemoved] = useState(false);
  const previousExists = !!(
    baseline.entry.from_status || baseline.entry.from_meaning
  );
  const changed =
    to !== (baseline.entry.to_meaning ?? 'unknown') ||
    (previousExists && from !== (baseline.entry.from_meaning ?? 'unknown')) ||
    when !== historyLocalTime(baseline.entry.changed_at, baseline.timeZone);
  const options = statusMeanings.map((value) => ({
    value,
    label: historyStageLabels[value],
  }));
  const inputClass =
    'bg-bg2 text-fg1 focus:ring-accent-bright mt-1 w-full rounded px-3 py-2 focus:ring-1 focus:outline-none';

  function close() {
    if ((!changed && !note) || confirm(t('Discard unsaved history changes?')))
      onClose();
  }
  async function reload() {
    if (!confirm(t('Reload the saved entry and discard this draft?'))) return;
    setPending(true);
    try {
      const [application, history] = await Promise.all([
        getApplication(applicationId),
        getApplicationHistory(applicationId),
      ]);
      const saved = history.find((item) => item.id === entry.id);
      if (!saved || saved.is_gap) {
        setRemoved(true);
        setError(
          t(
            'This history entry was removed. Close the editor to return to history.'
          )
        );
        return;
      }
      setBaseline({
        entry: saved,
        revision: application.evidence_revision,
        timeZone,
      });
      setFrom(saved.from_meaning ?? 'unknown');
      setTo(saved.to_meaning ?? 'unknown');
      setWhen(historyLocalTime(saved.changed_at, timeZone));
      setNote('');
      setConflict(false);
      setError('');
      await onChanged?.();
    } catch {
      setError(t('Could not reload the saved entry. Your draft is kept.'));
    } finally {
      setPending(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending || conflict || removed) return;
    if (!changed) {
      onClose();
      return;
    }
    setError('');
    const data: HistoryCorrection = { expected_revision: baseline.revision };
    if (to !== (baseline.entry.to_meaning ?? 'unknown')) data.to_meaning = to;
    if (previousExists && from !== (baseline.entry.from_meaning ?? 'unknown'))
      data.from_meaning = from;
    try {
      if (
        when !== historyLocalTime(baseline.entry.changed_at, baseline.timeZone)
      ) {
        data.changed_at = historyInstant(when, baseline.timeZone);
        if (Date.parse(data.changed_at) > Date.now())
          throw new Error(t('The event cannot be in the future.'));
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t('Check the date and time.')
      );
      return;
    }
    if (note.trim()) data.correction_note = note.trim();
    setPending(true);
    try {
      await correctHistoryEntry(applicationId, baseline.entry.id, data);
      await onChanged?.();
      onClose();
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      setConflict(status === 409);
      setError(
        status === 409
          ? t(
              'This entry changed elsewhere. Your draft is kept. Reload the saved entry before trying again.'
            )
          : safeErrorMessage(
              isAxiosError(error) ? error.response?.data?.detail : null,
              t(
                'Could not save the correction. Check the date is between neighbouring entries and try again. Your draft is kept.'
              )
            )
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal label={t('Edit history event')} onClose={close} busy={pending}>
      <form
        onSubmit={save}
        className="bg-bg1 mx-4 max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg p-6"
      >
        <h3 className="text-primary text-lg font-semibold">
          {t('Edit history event')}
        </h3>
        <p className="text-muted text-sm">
          {t(
            "Correct the recorded stage or date. This does not change the application's current status or the original note."
          )}
        </p>
        {error && (
          <p role="alert" className="text-red-bright text-sm">
            {error}
          </p>
        )}
        {conflict && !removed && (
          <Button
            type="button"
            disabled={pending}

            onClick={() => void reload()}
          >
            {t('Reload saved entry')}
          </Button>
        )}
        <fieldset
          disabled={pending || conflict || removed}
          className="space-y-4"
        >
          {previousExists && (
            <div>
              <label
                htmlFor={`history-from-${entry.id}`}
                className="mb-1 block text-sm"
              >
                {t('Previous recorded stage')}
              </label>
              <Dropdown
                id={`history-from-${entry.id}`}
                value={from}
                options={options}
                onChange={(value) => setFrom(value as StatusMeaning)}
                disabled={pending || conflict || removed}
              />
            </div>
          )}
          <div>
            <label
              htmlFor={`history-to-${entry.id}`}
              className="mb-1 block text-sm"
            >
              {t('Recorded stage')}
            </label>
            <Dropdown
              id={`history-to-${entry.id}`}
              value={to}
              options={options}
              onChange={(value) => setTo(value as StatusMeaning)}
              disabled={pending || conflict || removed}
            />
          </div>
          <label className="block text-sm">
            {t('Date and time (')}
            {baseline.timeZone})
            <input
              className={inputClass}
              type="datetime-local"
              step="1"
              required
              value={when}
              onChange={(event) =>
                setWhen(normalizeHistoryTime(event.target.value))
              }
            />
          </label>
          {baseline.entry.time_provenance !== 'recorded' && (
            <p className="text-muted text-sm">
              {t(
                'The saved date is unconfirmed. Leaving it unchanged does not confirm it.'
              )}
            </p>
          )}
          <p className="text-muted text-xs">
            {t(
              'Use a time between the neighbouring entries, not in the future.'
            )}
          </p>
          <label className="block text-sm">
            {t('Reason for correction (optional)')}
            <input
              className={inputClass}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={pending} onClick={close}>
            {t('Cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={pending || conflict || removed || !changed}
          >
            {pending ? t('Saving…') : t('Save changes')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
