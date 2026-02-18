import { useState, useRef, useEffect } from 'react';
import { uploadMedia, deleteMedia, getMediaSignedUrl, getRoundTranscriptSignedUrl, deleteRoundTranscript, uploadRoundTranscript } from '../lib/rounds';
import type { Round, RoundMedia } from '../lib/types';
import { API_BASE } from '../lib/api';
import MediaPlayer from './MediaPlayer';
import { downloadFile } from '../lib/downloadFile';
import ProgressBar from './ProgressBar';
import { useToast } from '@/hooks/useToast';

interface Props {
  round: Round;
  onEdit: () => void;
  onDelete: () => void;
  onMediaChange: () => void;
}

export default function RoundCard({ round, onEdit, onDelete, onMediaChange }: Props) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadingMediaFile, setUploadingMediaFile] = useState<File | null>(null);
  const [uploadingMediaProgress, setUploadingMediaProgress] = useState(0);
  const [uploadingTranscript, setUploadingTranscript] = useState(false);
  const [uploadingTranscriptFile, setUploadingTranscriptFile] = useState<File | null>(null);
  const [uploadingTranscriptProgress, setUploadingTranscriptProgress] = useState(0);
  const [playingMedia, setPlayingMedia] = useState<RoundMedia | null>(null);
  const mediaProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (mediaProgressRef.current) clearInterval(mediaProgressRef.current);
      if (transcriptProgressRef.current) clearInterval(transcriptProgressRef.current);
    };
  }, []);

  function formatDateTime(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  }

  function getOutcomeStyle(outcome: string | null) {
    switch (outcome) {
      case 'passed':
        return 'text-green-bright';
      case 'failed':
        return 'text-red-bright';
      case 'cancelled':
        return 'text-muted';
      default:
        return 'text-yellow-bright';
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

    mediaProgressRef.current = setInterval(() => {
      setUploadingMediaProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 100);

    try {
      await uploadMedia(round.id, file);
      if (mediaProgressRef.current) clearInterval(mediaProgressRef.current);
      setUploadingMediaProgress(100);
      onMediaChange();
      setTimeout(() => setUploadingMediaProgress(0), 500);
    } catch {
      if (mediaProgressRef.current) clearInterval(mediaProgressRef.current);
      toast.error('Failed to upload media');
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
      toast.error('Failed to delete media');
    }
  }

  async function handleMediaDownload(media: RoundMedia, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const apiBase = API_BASE;
      const { url } = await getMediaSignedUrl(media.id, 'attachment');
      const fullUrl = `${apiBase}${url}`;

      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error('Download failed');

      // Extract filename from Content-Disposition header (supports RFC 5987)
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'media';
      if (contentDisposition) {
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''(.+)/i);
        const stdMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (utf8Match) {
          filename = decodeURIComponent(utf8Match[1]);
        } else if (stdMatch) {
          filename = stdMatch[1];
        }
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      downloadFile(blobUrl, filename);
    } catch {
      toast.error('Failed to download media');
    }
  }

  async function handleTranscriptPreview() {
    try {
      const apiBase = API_BASE;
      const { url } = await getRoundTranscriptSignedUrl(round.id, 'inline');
      const fullUrl = `${apiBase}${url}`;
      window.open(fullUrl, '_blank');
    } catch {
      toast.error('Failed to preview transcript');
    }
  }

  async function handleTranscriptDelete() {
    if (!confirm('Delete this transcript?')) return;
    try {
      await deleteRoundTranscript(round.id);
      onMediaChange();
    } catch {
      toast.error('Failed to delete transcript');
    }
  }

  async function handleTranscriptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTranscript(true);
    setUploadingTranscriptFile(file);
    setUploadingTranscriptProgress(0);

    transcriptProgressRef.current = setInterval(() => {
      setUploadingTranscriptProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 100);

    try {
      await uploadRoundTranscript(round.id, file);
      if (transcriptProgressRef.current) clearInterval(transcriptProgressRef.current);
      setUploadingTranscriptProgress(100);
      onMediaChange();
      setTimeout(() => setUploadingTranscriptProgress(0), 500);
    } catch {
      if (transcriptProgressRef.current) clearInterval(transcriptProgressRef.current);
      toast.error('Failed to upload transcript');
      setUploadingTranscriptProgress(0);
    } finally {
      setUploadingTranscript(false);
      setUploadingTranscriptFile(null);
    }
  }

  return (
    <div className="bg-bg2 rounded-lg p-4">
      {playingMedia && (
        <MediaPlayer media={playingMedia} onClose={() => setPlayingMedia(null)} />
      )}

      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3 mb-3">
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
              className="p-2 rounded bg-transparent text-fg1 hover:bg-bg3 hover:text-fg0 transition-all duration-200 ease-in-out flex items-center justify-center cursor-pointer"
              aria-label="Edit round"
              title="Edit"
            >
              <i className="bi-pencil icon-md" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 rounded bg-transparent text-red hover:bg-bg3 hover:text-red-bright transition-all duration-200 ease-in-out flex items-center justify-center cursor-pointer"
              aria-label="Delete round"
              title="Delete"
            >
              <i className="bi-trash icon-md" />
            </button>
          </div>
        </div>
      </div>

      {round.notes_summary && (
        <div className="mb-3">
          <p className="text-sm text-secondary whitespace-pre-wrap">{round.notes_summary}</p>
        </div>
      )}

      <div className="border-t border-tertiary pt-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <span className="text-sm text-muted">Media Files</span>
          <label className={`bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded font-medium flex items-center gap-1.5 text-sm ${uploading ? 'opacity-50' : ''} cursor-pointer`}>
            <i className="bi-plus-circle icon-sm"></i>
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
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-bg3 rounded px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {m.media_type === 'video' ? (
                    <i className="bi-camera-video icon-md text-purple-bright flex-shrink-0" />
                  ) : (
                    <i className="bi-music-note-beamed icon-md text-orange-bright flex-shrink-0" />
                  )}
                  <span className="text-sm text-primary truncate">
                    {m.file_path.split('/').pop()}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setPlayingMedia(m)}
                    className="bg-transparent text-fg1 hover:bg-bg4 hover:text-fg0 transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm cursor-pointer"
                    title="Play"
                  >
                    <i className="bi-play-fill icon-md" />
                    Play
                  </button>
                  <button
                    onClick={(e) => handleMediaDownload(m, e)}
                    className="bg-transparent text-fg1 hover:bg-bg4 hover:text-fg0 transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm cursor-pointer"
                    title="Download"
                  >
                    <i className="bi-download icon-sm" />
                    Download
                  </button>
                  <button
                    onClick={(e) => handleMediaDelete(m.id, e)}
                    className="bg-transparent text-red hover:bg-bg4 hover:text-red-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm cursor-pointer"
                    title="Delete"
                  >
                    <i className="bi-trash icon-sm" />
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

      <div className="border-t border-tertiary pt-3 mt-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <span className="text-sm text-muted">Transcript</span>
          {!round.transcript_path && (
            <label className={`bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded font-medium flex items-center gap-1.5 text-sm ${uploadingTranscript ? 'opacity-50' : ''} cursor-pointer`}>
              <i className="bi-plus-circle icon-sm"></i>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-bg3 rounded px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <i className="bi-file-text icon-md text-red-bright flex-shrink-0" />
                <span className="text-sm text-primary truncate">
                  {round.transcript_path.split('/').pop()}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleTranscriptPreview}
                  disabled={uploadingTranscript}
                  className="bg-transparent text-fg1 hover:bg-bg4 hover:text-fg0 transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm disabled:opacity-50 cursor-pointer"
                  title="View"
                >
                  <i className="bi-eye icon-sm" />
                  View
                </button>
                <button
                  onClick={handleTranscriptDelete}
                  disabled={uploadingTranscript}
                  className="bg-transparent text-red hover:bg-bg4 hover:text-red-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm disabled:opacity-50 cursor-pointer"
                  title="Delete"
                >
                  <i className="bi-trash icon-sm" />
                  Delete
                </button>
              </div>
            </div>
            {round.transcript_summary && (
              <div className="mt-2 bg-bg3 rounded px-3 py-2">
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
