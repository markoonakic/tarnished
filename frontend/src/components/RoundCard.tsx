import { useState } from 'react';
import { uploadMedia, deleteMedia, getMediaSignedUrl } from '../lib/rounds';
import type { Round, RoundMedia } from '../lib/types';
import MediaPlayer from './MediaPlayer';

interface Props {
  round: Round;
  onEdit: () => void;
  onDelete: () => void;
  onMediaChange: () => void;
}

export default function RoundCard({ round, onEdit, onDelete, onMediaChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [playingMedia, setPlayingMedia] = useState<RoundMedia | null>(null);

  function formatDateTime(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  }

  function getOutcomeStyle(outcome: string | null) {
    switch (outcome) {
      case 'passed':
        return 'text-accent-green';
      case 'failed':
        return 'text-accent-red';
      case 'cancelled':
        return 'text-muted';
      default:
        return 'text-accent-yellow';
    }
  }

  function getOutcomeLabel(outcome: string | null) {
    if (!outcome) return 'Pending';
    return outcome.charAt(0).toUpperCase() + outcome.slice(1);
  }

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadMedia(round.id, file);
      onMediaChange();
    } catch {
      alert('Failed to upload media');
    } finally {
      setUploading(false);
    }
  }

  async function handleMediaDelete(mediaId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this media file?')) return;
    try {
      await deleteMedia(mediaId);
      onMediaChange();
    } catch {
      alert('Failed to delete media');
    }
  }

  async function handleMediaDownload(media: RoundMedia, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const { url } = await getMediaSignedUrl(media.id, 'attachment');
      const link = document.createElement('a');
      link.href = `${apiBase}${url}`;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('Failed to download media');
    }
  }

  return (
    <div className="bg-tertiary rounded-lg p-4">
      {playingMedia && (
        <MediaPlayer media={playingMedia} onClose={() => setPlayingMedia(null)} />
      )}

      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className="text-primary font-medium">{round.round_type.name}</h4>
          <p className="text-sm text-muted">
            Scheduled: {formatDateTime(round.scheduled_at)}
          </p>
          {round.completed_at && (
            <p className="text-sm text-muted">
              Completed: {formatDateTime(round.completed_at)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${getOutcomeStyle(round.outcome)}`}>
            {getOutcomeLabel(round.outcome)}
          </span>
          <button
            onClick={onEdit}
            className="p-1 text-muted hover:text-primary"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-muted hover:text-accent-red"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {round.notes_summary && (
        <div className="mb-3">
          <p className="text-sm text-secondary whitespace-pre-wrap">{round.notes_summary}</p>
        </div>
      )}

      <div className="border-t border-secondary pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted">Media Files</span>
          <label className={`text-sm text-accent-aqua hover:underline cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
            {uploading ? 'Uploading...' : '+ Add Media'}
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={handleMediaUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {round.media.length > 0 ? (
          <div className="space-y-2">
            {round.media.map((m) => (
              <div
                key={m.id}
                onClick={() => setPlayingMedia(m)}
                className="flex items-center justify-between bg-secondary rounded px-3 py-2 cursor-pointer hover:bg-primary/10"
              >
                <div className="flex items-center gap-2">
                  {m.media_type === 'video' ? (
                    <svg className="w-4 h-4 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-accent-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  )}
                  <span className="text-sm text-primary truncate max-w-[200px]">
                    {m.file_path.split('/').pop()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleMediaDownload(m, e)}
                    className="text-muted hover:text-accent-aqua"
                    title="Download"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => handleMediaDelete(m.id, e)}
                    className="text-muted hover:text-accent-red"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No media files</p>
        )}
      </div>
    </div>
  );
}
