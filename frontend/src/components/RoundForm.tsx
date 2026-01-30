import { useState, useEffect } from 'react';
import { createRound, updateRound, uploadRoundTranscript } from '../lib/rounds';
import { listRoundTypes } from '../lib/settings';
import type { Round, RoundType, RoundCreate, RoundUpdate } from '../lib/types';
import ProgressBar from './ProgressBar';

interface Props {
  applicationId: string;
  round?: Round | null;
  onSave: (savedRound: Round) => void;
  onCancel: () => void;
}

export default function RoundForm({ applicationId, round, onSave, onCancel }: Props) {
  const isEditing = Boolean(round);
  const [roundTypes, setRoundTypes] = useState<RoundType[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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

    setLoading(true);
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
        setUploadProgress(0);
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => {
            if (prev >= 90) return prev;
            return prev + 10;
          });
        }, 100);

        try {
          savedRound = await uploadRoundTranscript(savedRound.id, transcriptFile);
          clearInterval(progressInterval);
          setUploadProgress(100);
          setTimeout(() => setUploadProgress(0), 500);
        } catch {
          clearInterval(progressInterval);
          setUploadProgress(0);
          throw new Error('Failed to upload transcript');
        }
      }

      onSave(savedRound);
    } catch {
      setError('Failed to save round. Please check your inputs.');
    } finally {
      setLoading(false);
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
          <label className="block mb-1 text-sm font-semibold text-muted">Round Type</label>
          <select
            value={roundTypeId}
            onChange={(e) => setRoundTypeId(e.target.value)}
            className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-[#8ec07c] transition-colors duration-200 ease"
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
          <label className="block mb-1 text-sm font-semibold text-muted">Scheduled Date</label>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-[#8ec07c] transition-colors duration-200 ease"
          />
        </div>

        <div>
          <label className="block mb-1 text-sm font-semibold text-muted">Time (optional)</label>
          <input
            type="text"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            placeholder="e.g. 2:30 PM"
            className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-[#8ec07c] transition-colors duration-200 ease"
          />
        </div>

        {round && (
          <>
            <div>
              <label className="block mb-1 text-sm font-semibold text-muted">Outcome</label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-[#8ec07c] transition-colors duration-200 ease"
              >
                <option value="">Pending</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-semibold text-muted">Completed Date</label>
              <input
                type="date"
                value={completedDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-[#8ec07c] transition-colors duration-200 ease"
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-semibold text-muted">Time (optional)</label>
              <input
                type="text"
                value={completedTime}
                onChange={(e) => setCompletedTime(e.target.value)}
                placeholder="e.g. 2:30 PM"
                className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-[#8ec07c] transition-colors duration-200 ease"
              />
            </div>
          </>
        )}

        <div className="col-span-2">
          <label className="block mb-1 text-sm font-semibold text-muted">Notes</label>
          <textarea
            value={notesSummary}
            onChange={(e) => setNotesSummary(e.target.value)}
            rows={3}
            placeholder="Key points, questions asked, feedback..."
            className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-[#8ec07c] transition-colors duration-200 ease resize-y"
          />
        </div>

        <div className="col-span-2">
          <label className="block mb-1 text-sm font-semibold text-muted">Transcript (PDF)</label>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setTranscriptFile(e.target.files?.[0] || null)}
            className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary focus:outline-none focus:border-[#8ec07c] transition-colors duration-200 ease"
          />
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mt-2">
              <ProgressBar progress={uploadProgress} fileName={transcriptFile?.name} />
            </div>
          )}
          {round?.transcript_path && !transcriptFile && (
            <div className="flex items-center gap-2 p-2 bg-secondary rounded border border-tertiary mt-2">
              <i className="bi-file-text text-accent-red"></i>
              <span className="text-sm text-primary truncate">Current: {round.transcript_path.split('/').pop()}</span>
            </div>
          )}
        </div>

        <div className="col-span-2">
          <label className="block mb-1 text-sm font-semibold text-muted">Transcript Summary</label>
          <textarea
            value={transcriptSummary}
            onChange={(e) => setTranscriptSummary(e.target.value)}
            rows={3}
            placeholder="Summary of key discussion points from transcript..."
            className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-[#8ec07c] transition-colors duration-200 ease resize-y"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-bg1 text-fg1 rounded hover:bg-bg2 disabled:opacity-50 transition-all duration-200 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright disabled:opacity-50 transition-all duration-200 cursor-pointer"
        >
          {loading ? 'Saving...' : isEditing ? 'Save' : 'Add Round'}
        </button>
      </div>
    </form>
  );
}
