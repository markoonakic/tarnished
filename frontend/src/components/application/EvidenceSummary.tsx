import { useState } from 'react';
import { correctCurrentMeaning, historyStageLabels } from '@/lib/history';
import {
  statusMeanings,
  type Application,
  type StatusMeaning,
} from '@/lib/types';
import Dropdown from '../Dropdown';

export default function EvidenceSummary({
  application,
  onChanged,
}: {
  application: Application;
  onChanged: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [meaning, setMeaning] = useState<StatusMeaning>(
    application.status_meaning
  );
  const [baseline, setBaseline] = useState({
    meaning: application.status_meaning,
    revision: application.evidence_revision,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return (
    <details className="bg-bg1 mb-3 space-y-3 rounded-lg p-4 text-sm">
      <summary className="text-fg1 cursor-pointer font-semibold">
        Current stage and employer reply
      </summary>
      <p>Recorded stage: {historyStageLabels[application.status_meaning]}.</p>
      <p>
        {application.response_state === 'recorded'
          ? `Employer reply recorded${application.response_occurred_on ? ` on ${application.response_occurred_on}` : ' (date not supplied)'}.`
          : application.response_state === 'legacy_unknown'
            ? 'Earlier reply history is not known.'
            : 'No employer reply recorded.'}
      </p>
      {application.response_reference && (
        <p className="whitespace-pre-wrap">{application.response_reference}</p>
      )}
      <p className="text-muted">
        Use Edit application to move to a new status or update the employer
        reply. Correct the recorded stage here only if it is wrong.
      </p>
      {!editing && (
        <button
          type="button"
          className="text-accent hover:bg-bg2 hover:text-accent-bright cursor-pointer rounded px-3 py-2 transition-colors"
          onClick={() => {
            setMeaning(application.status_meaning);
            setBaseline({
              meaning: application.status_meaning,
              revision: application.evidence_revision,
            });
            setError('');
            setEditing(true);
          }}
        >
          Correct recorded stage
        </button>
      )}
      {editing && (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            if (meaning === baseline.meaning) {
              setEditing(false);
              return;
            }
            setPending(true);
            setError('');
            try {
              await correctCurrentMeaning(
                application.id,
                meaning,
                baseline.revision
              );
              await onChanged();
              setEditing(false);
            } catch {
              setError(
                'Could not save. Your choice is kept. Cancel and reopen to load the current stage before trying again.'
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <p className="text-muted">
            This corrects the current recorded stage. Earlier transition dates
            stay unchanged.
          </p>
          <div>
            <label
              htmlFor={`current-stage-${application.id}`}
              className="mb-1 block"
            >
              Recorded stage
            </label>
            <Dropdown
              id={`current-stage-${application.id}`}
              value={meaning}
              options={statusMeanings.map((value) => ({
                value,
                label: historyStageLabels[value],
              }))}
              onChange={(value) => setMeaning(value as StatusMeaning)}
              disabled={pending}
            />
          </div>
          {error && (
            <p role="alert" className="text-red-bright">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              className="text-fg1 hover:bg-bg2 cursor-pointer rounded px-4 py-2 transition-colors disabled:opacity-50"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || meaning === baseline.meaning}
              className="bg-accent text-bg0 hover:bg-accent-bright cursor-pointer rounded px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </details>
  );
}
