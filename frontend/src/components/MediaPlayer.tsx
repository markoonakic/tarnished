import { useRef, useState, useEffect } from 'react';
import type { RoundMedia } from '../lib/types';
import { getMediaSignedUrl } from '../lib/rounds';

interface Props {
  media: RoundMedia;
  onClose: () => void;
}

export default function MediaPlayer({ media, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const isVideo = media.media_type === 'video';
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  useEffect(() => {
    async function fetchSignedUrl() {
      try {
        const { url } = await getMediaSignedUrl(media.id, 'inline');
        setMediaUrl(`${apiBase}${url}`);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchSignedUrl();
  }, [media.id, apiBase]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  function handleError() {
    setError(true);
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-secondary rounded-lg max-w-4xl w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-tertiary">
          <h3 className="text-primary font-medium truncate">
            {media.file_path.split('/').pop()}
          </h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary p-1 transition-colors duration-200"
          >
            <i className="bi bi-x-lg text-xl" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-center py-12 text-muted">Loading...</div>
          ) : error || !mediaUrl ? (
            <div className="text-center py-12 text-accent-red">
              Failed to load media file
            </div>
          ) : isVideo ? (
            <video
              ref={videoRef}
              src={mediaUrl}
              controls
              autoPlay
              onError={handleError}
              className="w-full max-h-[60vh] bg-black rounded"
            >
              Your browser does not support video playback.
            </video>
          ) : (
            <div className="py-8">
              <div className="flex justify-center mb-4">
                <div className="w-24 h-24 rounded-full bg-tertiary flex items-center justify-center">
                  <svg className="w-12 h-12 text-accent-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
              </div>
              <audio
                ref={audioRef}
                src={mediaUrl}
                controls
                autoPlay
                onError={handleError}
                className="w-full"
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          )}
        </div>

        <div className="px-4 pb-4 text-sm text-muted">
          Uploaded: {new Date(media.uploaded_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
