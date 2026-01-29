import { useState } from 'react';
import { uploadMedia, deleteMedia, getMediaSignedUrl, getRoundTranscriptSignedUrl, deleteRoundTranscript, uploadRoundTranscript } from '../lib/rounds';
import type { Round, RoundMedia } from '../lib/types';
import MediaPlayer from './MediaPlayer';
import { downloadFile } from '../lib/downloadFile';
import ProgressBar from './ProgressBar';

interface Props {
  round: Round;
  onEdit: () => void;
  onDelete: () => void;
  onMediaChange: () => void;
}

export default function RoundCard({ round, onEdit, onDelete, onMediaChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadingMediaFile, setUploadingMediaFile] = useState<File | null>(null);
  const [uploadingMediaProgress, setUploadingMediaProgress] = useState(0);
  const [uploadingTranscript, setUploadingTranscript] = useState(false);
  const [uploadingTranscriptFile, setUploadingTranscriptFile] = useState<File | null>(null);
  const [uploadingTranscriptProgress, setUploadingTranscriptProgress] = useState(0);
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
    setUploadingMediaFile(file);
    setUploadingMediaProgress(0);

    const progressInterval = setInterval(() => {
      setUploadingMediaProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 100);

    try {
      await uploadMedia(round.id, file);
      clearInterval(progressInterval);
      setUploadingMediaProgress(100);
      onMediaChange();
      setTimeout(() => setUploadingMediaProgress(0), 500);
    } catch {
      clearInterval(progressInterval);
      alert('Failed to upload media');
      setUploadingMediaProgress(0);
    } finally {
      setUploading(false);
      setUploadingMediaFile(null);
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
      const fullUrl = `${apiBase}${url}`;

      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error('Download failed');

      // Extract filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'media';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      downloadFile(blobUrl, filename);
    } catch {
      alert('Failed to download media');
    }
  }

  // TODO: handleTranscriptDownload is currently unused but may be needed for future download functionality
  // async function handleTranscriptDownload() {
  //   try {
  //     const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  //     const { url } = await getRoundTranscriptSignedUrl(round.id, 'attachment');
  //     const fullUrl = `${apiBase}${url}`;
  //
  //     const response = await fetch(fullUrl);
  //     if (!response.ok) throw new Error('Download failed');
  //
  //     const contentDisposition = response.headers.get('Content-Disposition');
  //     let filename = 'transcript.pdf';
  //     if (contentDisposition) {
  //       const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
  //       if (filenameMatch) {
  //         filename = filenameMatch[1];
  //       }
  //     }
  //
  //     const blob = await response.blob();
  //     const blobUrl = URL.createObjectURL(blob);
  //
  //     downloadFile(blobUrl, filename);
  //   } catch {
  //     alert('Failed to download transcript');
  //   }
  // }

  async function handleTranscriptPreview() {
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const { url } = await getRoundTranscriptSignedUrl(round.id, 'inline');
      const fullUrl = `${apiBase}${url}`;
      window.open(fullUrl, '_blank');
    } catch {
      alert('Failed to preview transcript');
    }
  }

  async function handleTranscriptDelete() {
    if (!confirm('Delete this transcript?')) return;
    try {
      await deleteRoundTranscript(round.id);
      onMediaChange();
    } catch {
      alert('Failed to delete transcript');
    }
  }

  async function handleTranscriptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTranscript(true);
    setUploadingTranscriptFile(file);
    setUploadingTranscriptProgress(0);

    const progressInterval = setInterval(() => {
      setUploadingTranscriptProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 100);

    try {
      await uploadRoundTranscript(round.id, file);
      clearInterval(progressInterval);
      setUploadingTranscriptProgress(100);
      onMediaChange();
      setTimeout(() => setUploadingTranscriptProgress(0), 500);
    } catch {
      clearInterval(progressInterval);
      alert('Failed to upload transcript');
      setUploadingTranscriptProgress(0);
    } finally {
      setUploadingTranscript(false);
      setUploadingTranscriptFile(null);
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
        <div className="flex items-center gap-4">
          <span className={`text-sm font-medium ${getOutcomeStyle(round.outcome)}`}>
            {getOutcomeLabel(round.outcome)}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onEdit}
              className="p-2 text-fg1 rounded hover:bg-bg1 hover:text-fg0 transition-all duration-200 cursor-pointer"
              aria-label="Edit round"
              title="Edit"
            >
              <i className="bi-pencil text-base" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-red rounded hover:bg-bg1 hover:text-red-bright transition-all duration-200 cursor-pointer"
              aria-label="Delete round"
              title="Delete"
            >
              <i className="bi-trash text-base" />
            </button>
          </div>
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
          <label className={`px-3 py-1.5 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright transition-all duration-200 cursor-pointer flex items-center gap-1.5 text-sm ${uploading ? 'opacity-50' : ''}`}>
            <i className="bi-plus-circle"></i>
            {uploading ? 'Uploading...' : 'Add Media'}
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={handleMediaUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {uploadingMediaProgress > 0 && uploadingMediaProgress < 100 && (
          <div className="mb-2">
            <ProgressBar progress={uploadingMediaProgress} fileName={uploadingMediaFile?.name} />
          </div>
        )}

        {round.media.length > 0 ? (
          <div className="space-y-2">
            {round.media.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between bg-secondary rounded px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {m.media_type === 'video' ? (
                    <i className="bi-camera-video text-base text-accent-purple" />
                  ) : (
                    <i className="bi-music-note-beamed text-base text-accent-orange" />
                  )}
                  <span className="text-sm text-primary truncate max-w-[200px]">
                    {m.file_path.split('/').pop()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPlayingMedia(m)}
                    className="px-3 py-1.5 bg-bg1 text-fg1 rounded hover:bg-bg2 hover:text-fg0 transition-all duration-200 flex items-center gap-1.5 text-sm cursor-pointer"
                    title="Play"
                  >
                    <i className="bi-play-fill" />
                    Play
                  </button>
                  <button
                    onClick={(e) => handleMediaDownload(m, e)}
                    className="px-3 py-1.5 bg-bg1 text-fg1 rounded hover:bg-bg2 hover:text-fg0 transition-all duration-200 flex items-center gap-1.5 text-sm cursor-pointer"
                    title="Download"
                  >
                    <i className="bi-download" />
                    Download
                  </button>
                  <button
                    onClick={(e) => handleMediaDelete(m.id, e)}
                    className="px-3 py-1.5 bg-bg1 text-red rounded hover:bg-bg2 hover:text-red-bright transition-all duration-200 flex items-center gap-1.5 text-sm cursor-pointer"
                    title="Delete"
                  >
                    <i className="bi-trash" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No media files</p>
        )}
      </div>

      <div className="border-t border-secondary pt-3 mt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted">Transcript</span>
          {!round.transcript_path && (
            <label className={`px-3 py-1.5 bg-aqua text-bg0 rounded font-medium hover:bg-aqua-bright transition-all duration-200 cursor-pointer flex items-center gap-1.5 text-sm ${uploadingTranscript ? 'opacity-50' : ''}`}>
              <i className="bi-plus-circle"></i>
              {uploadingTranscript ? 'Uploading...' : 'Add Transcript'}
              <input
                type="file"
                accept=".pdf"
                onChange={handleTranscriptUpload}
                disabled={uploadingTranscript}
                className="hidden"
              />
            </label>
          )}
        </div>

        {uploadingTranscriptProgress > 0 && uploadingTranscriptProgress < 100 && (
          <div className="mb-2">
            <ProgressBar progress={uploadingTranscriptProgress} fileName={uploadingTranscriptFile?.name} />
          </div>
        )}

        {round.transcript_path ? (
          <>
            <div className="flex items-center justify-between bg-secondary rounded px-3 py-2">
              <div className="flex items-center gap-2">
                <i className="bi-file-text text-base text-accent-red" />
                <span className="text-sm text-primary truncate max-w-[200px]">
                  {round.transcript_path.split('/').pop()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTranscriptPreview}
                  disabled={uploadingTranscript}
                  className="px-3 py-1.5 bg-bg1 text-fg1 rounded hover:bg-bg2 hover:text-fg0 disabled:opacity-50 transition-all duration-200 flex items-center gap-1.5 text-sm cursor-pointer"
                  title="View"
                >
                  <i className="bi-eye" />
                  View
                </button>
                <button
                  onClick={handleTranscriptDelete}
                  disabled={uploadingTranscript}
                  className="px-3 py-1.5 bg-bg1 text-red rounded hover:bg-bg2 hover:text-red-bright disabled:opacity-50 transition-all duration-200 flex items-center gap-1.5 text-sm cursor-pointer"
                  title="Delete"
                >
                  <i className="bi-trash" />
                  Delete
                </button>
              </div>
            </div>
            {round.transcript_summary && (
              <div className="mt-2 bg-secondary rounded px-3 py-2">
                <p className="text-sm text-muted mb-1">Summary:</p>
                <p className="text-sm text-secondary whitespace-pre-wrap">{round.transcript_summary}</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">No transcript uploaded</p>
        )}
      </div>
    </div>
  );
}
