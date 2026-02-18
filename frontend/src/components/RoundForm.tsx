import { useState, useEffect, useRef } from 'react';
import { createRound, updateRound, uploadRoundTranscript } from '../lib/rounds';
import { listRoundTypes } from '../lib/settings';
import type { Round, RoundType, RoundCreate, RoundUpdate } from '../lib/types';
import Dropdown from './Dropdown';
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
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

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
        progressRef.current = setInterval(() => {
          setUploadProgress((prev) => {
            if (prev >= 90) return prev;
            return prev + 10;
          });
        }, 100);

        try {
          savedRound = await uploadRoundTranscript(savedRound.id, transcriptFile);
          if (progressRef.current) clearInterval(progressRef.current);
          setUploadProgress(100);
          setTimeout(() => setUploadProgress(0), 500);
        } catch {
          if (progressRef.current) clearInterval(progressRef.current);
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
    <form onSubmit={handleSubmit} className="bg-bg2 rounded-lg p-4">
      <h3 className="text-primary font-medium mb-4">
        {round ? 'Edit Round' : 'New Round'}
      </h3>

      {error && (
        <div className="bg-red-bright/20 border border-red-bright text-red-bright px-3 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-semibold text-muted">Round Type</label>
          <Dropdown
            options={[
              { value: '', label: 'Select type' },
              ...roundTypes.map((type) => ({ value: type.id, label: type.name }))
            ]}
            value={roundTypeId}
            onChange={(value) => setRoundTypeId(value)}
            placeholder="Select type"
            containerBackground="bg2"
          />
        </div>

        <div>
          <label htmlFor="scheduled-date" className="block mb-1 text-sm font-semibold text-muted">Scheduled Date</label>
          <input
            id="scheduled-date"
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="w-full px-3 py-2 bg-bg3 text-fg1 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
          />
        </div>

        <div>
          <label htmlFor="scheduled-time" className="block mb-1 text-sm font-semibold text-muted">Time (optional)</label>
          <input
            id="scheduled-time"
            type="text"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            placeholder="e.g. 2:30 PM"
            className="w-full px-3 py-2 bg-bg3 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
          />
        </div>

        {round && (
          <>
            <div>
              <label className="block mb-1 text-sm font-semibold text-muted">Outcome</label>
              <Dropdown
                options={[
                  { value: '', label: 'Pending' },
                  { value: 'passed', label: 'Passed' },
                  { value: 'failed', label: 'Failed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
                value={outcome}
                onChange={(value) => setOutcome(value)}
                placeholder="Pending"
                containerBackground="bg2"
              />
            </div>

            <div>
              <label htmlFor="completed-date" className="block mb-1 text-sm font-semibold text-muted">Completed Date</label>
              <input
                id="completed-date"
                type="date"
                value={completedDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                className="w-full px-3 py-2 bg-bg3 text-fg1 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
              />
            </div>

            <div>
              <label htmlFor="completed-time" className="block mb-1 text-sm font-semibold text-muted">Time (optional)</label>
              <input
                id="completed-time"
                type="text"
                value={completedTime}
                onChange={(e) => setCompletedTime(e.target.value)}
                placeholder="e.g. 2:30 PM"
                className="w-full px-3 py-2 bg-bg3 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
              />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="round-notes" className="block mb-1 text-sm font-semibold text-muted">Notes</label>
          <textarea
            id="round-notes"
            value={notesSummary}
            onChange={(e) => setNotesSummary(e.target.value)}
            rows={3}
            placeholder="Key points, questions asked, feedback..."
            className="w-full px-3 py-2 bg-bg3 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded resize-y"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block mb-1 text-sm font-semibold text-muted">Transcript (PDF)</label>
          <label className="bg-transparent text-fg1 hover:bg-bg3 hover:text-fg0 transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm cursor-pointer w-fit">
            <i className="bi-upload icon-sm"></i>
            {transcriptFile ? transcriptFile.name : 'Choose PDF...'}
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setTranscriptFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mt-2">
              <ProgressBar progress={uploadProgress} fileName={transcriptFile?.name} />
            </div>
          )}
          {round?.transcript_path && !transcriptFile && (
            <div className="flex items-center gap-2 p-2 bg-secondary rounded border border-tertiary mt-2">
              <i className="bi-file-text icon-md text-red-bright"></i>
              <span className="text-sm text-primary truncate">Current: {round.transcript_path.split('/').pop()}</span>
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="transcript-summary" className="block mb-1 text-sm font-semibold text-muted">Transcript Summary</label>
          <textarea
            id="transcript-summary"
            value={transcriptSummary}
            onChange={(e) => setTranscriptSummary(e.target.value)}
            rows={3}
            placeholder="Summary of key discussion points from transcript..."
            className="w-full px-3 py-2 bg-bg3 text-fg1 placeholder-muted focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded resize-y"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          className="bg-transparent text-fg1 hover:bg-bg3 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md disabled:opacity-50 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Saving...' : isEditing ? 'Save' : 'Add Round'}
        </button>
      </div>
    </form>
  );
}
