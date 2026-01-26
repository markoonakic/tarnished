import { useState, useEffect } from 'react';
import { createRound, updateRound, uploadRoundTranscript } from '../lib/rounds';
import { listRoundTypes } from '../lib/settings';
import type { Round, RoundType, RoundCreate, RoundUpdate } from '../lib/types';

interface Props {
  applicationId: string;
  round?: Round | null;
  onSave: (savedRound: Round) => void;
  onCancel: () => void;
}

export default function RoundForm({ applicationId, round, onSave, onCancel }: Props) {
  const [roundTypes, setRoundTypes] = useState<RoundType[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function parseDateTime(isoString: string | null): { date: string; time: string } {
    if (!isoString) return { date: '', time: '' };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { date: '', time: '' };
    const dateStr = d.toISOString().split('T')[0];
    const hours = d.getHours();
    const minutes = d.getMinutes();
    if (hours === 0 && minutes === 0) return { date: dateStr, time: '' };
    const period = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    const m = minutes.toString().padStart(2, '0');
    return { date: dateStr, time: `${h}:${m} ${period}` };
  }

  function formatDateTimeForApi(dateStr: string, timeStr: string): string | undefined {
    if (!dateStr) return undefined;
    if (!timeStr) return `${dateStr}T00:00:00`;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return `${dateStr}T00:00:00`;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3]?.toUpperCase();
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return `${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  }

  const scheduledParsed = parseDateTime(round?.scheduled_at ?? null);
  const completedParsed = parseDateTime(round?.completed_at ?? null);

  const [roundTypeId, setRoundTypeId] = useState(round?.round_type.id || '');
  const [scheduledDate, setScheduledDate] = useState(scheduledParsed.date);
  const [scheduledTime, setScheduledTime] = useState(scheduledParsed.time);
  const [completedDate, setCompletedDate] = useState(completedParsed.date);
  const [completedTime, setCompletedTime] = useState(completedParsed.time);
  const [outcome, setOutcome] = useState(round?.outcome || '');
  const [notesSummary, setNotesSummary] = useState(round?.notes_summary || '');
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [transcriptSummary, setTranscriptSummary] = useState(round?.transcript_summary || '');

  useEffect(() => {
    loadRoundTypes();
  }, []);

  async function loadRoundTypes() {
    try {
      const data = await listRoundTypes();
      setRoundTypes(data);
      if (!round && data.length > 0) {
        const defaultType = data.find((t) => t.is_default) || data[0];
        setRoundTypeId(defaultType.id);
      }
    } catch {
      setError('Failed to load round types');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roundTypeId) {
      setError('Please select a round type');
      return;
    }

    setSaving(true);
    setError('');

    try {
      let savedRound: Round;
      if (round) {
        const data: RoundUpdate = {
          round_type_id: roundTypeId,
          scheduled_at: formatDateTimeForApi(scheduledDate, scheduledTime),
          completed_at: formatDateTimeForApi(completedDate, completedTime),
          outcome: outcome || undefined,
          notes_summary: notesSummary || undefined,
          transcript_summary: transcriptSummary || undefined,
        };
        savedRound = await updateRound(round.id, data);
      } else {
        const data: RoundCreate = {
          round_type_id: roundTypeId,
          scheduled_at: formatDateTimeForApi(scheduledDate, scheduledTime),
          notes_summary: notesSummary || undefined,
          transcript_summary: transcriptSummary || undefined,
        };
        savedRound = await createRound(applicationId, data);
      }

      // Upload transcript if file is selected
      if (transcriptFile) {
        savedRound = await uploadRoundTranscript(savedRound.id, transcriptFile);
      }

      onSave(savedRound);
    } catch {
      setError('Failed to save round. Please check your inputs.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-tertiary rounded-lg p-4">
      <h3 className="text-primary font-medium mb-4">
        {round ? 'Edit Round' : 'New Round'}
      </h3>

      {error && (
        <div className="bg-accent-red/20 border border-accent-red text-accent-red px-3 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-muted mb-1">Round Type</label>
          <select
            value={roundTypeId}
            onChange={(e) => setRoundTypeId(e.target.value)}
            className="w-full px-3 py-2 bg-secondary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua"
          >
            <option value="">Select type</option>
            {roundTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Scheduled Date</label>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="w-full px-3 py-2 bg-secondary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua"
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Time (optional)</label>
          <input
            type="text"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            placeholder="e.g. 2:30 PM"
            className="w-full px-3 py-2 bg-secondary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua"
          />
        </div>

        {round && (
          <>
            <div>
              <label className="block text-sm text-muted mb-1">Outcome</label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full px-3 py-2 bg-secondary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua"
              >
                <option value="">Pending</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">Completed Date</label>
              <input
                type="date"
                value={completedDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                className="w-full px-3 py-2 bg-secondary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua"
              />
            </div>

            <div>
              <label className="block text-sm text-muted mb-1">Time (optional)</label>
              <input
                type="text"
                value={completedTime}
                onChange={(e) => setCompletedTime(e.target.value)}
                placeholder="e.g. 2:30 PM"
                className="w-full px-3 py-2 bg-secondary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua"
              />
            </div>
          </>
        )}

        <div className="col-span-2">
          <label className="block text-sm text-muted mb-1">Notes</label>
          <textarea
            value={notesSummary}
            onChange={(e) => setNotesSummary(e.target.value)}
            rows={3}
            placeholder="Key points, questions asked, feedback..."
            className="w-full px-3 py-2 bg-secondary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua resize-y"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm text-muted mb-1">Transcript (PDF)</label>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setTranscriptFile(e.target.files?.[0] || null)}
            className="w-full px-3 py-2 bg-secondary border border-muted rounded text-primary focus:outline-none focus:border-accent-aqua"
          />
          {round?.transcript_path && !transcriptFile && (
            <p className="text-xs text-muted mt-1">Current: {round.transcript_path.split('/').pop()}</p>
          )}
        </div>

        <div className="col-span-2">
          <label className="block text-sm text-muted mb-1">Transcript Summary</label>
          <textarea
            value={transcriptSummary}
            onChange={(e) => setTranscriptSummary(e.target.value)}
            rows={3}
            placeholder="Summary of key discussion points from transcript..."
            className="w-full px-3 py-2 bg-secondary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua resize-y"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-tertiary text-primary rounded hover:bg-muted disabled:opacity-50 transition-all duration-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-accent-aqua text-bg-primary rounded font-medium hover:opacity-90 disabled:opacity-50 transition-all duration-200"
        >
          {saving ? 'Saving...' : round ? 'Save' : 'Add Round'}
        </button>
      </div>
    </form>
  );
}
