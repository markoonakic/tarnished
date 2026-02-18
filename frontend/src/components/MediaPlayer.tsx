import { useRef, useState, useEffect } from 'react';
import type { RoundMedia } from '../lib/types';
import { getMediaSignedUrl } from '../lib/rounds';
import { API_BASE } from '../lib/api';

interface Props {
  media: RoundMedia;
  onClose: () => void;
}

export default function MediaPlayer({ media, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const isVideo = media.media_type === 'video';
  const apiBase = API_BASE;

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
    // Focus management - store and restore focus
    const previouslyFocused = document.activeElement as HTMLElement;

    // Focus close button when modal opens
    closeButtonRef.current?.focus();

    // Return focus when modal closes
    return () => {
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    
    function handleTab(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
    
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleTab);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTab);
    };
  }, [onClose]);

  function handleError() {
    setError(true);
  }

  return (
    <div
      className="fixed inset-0 bg-bg0/80 flex items-center justify-center z-50"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
    >
      <div ref={modalRef} className="bg-bg1 rounded-lg max-w-4xl w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-tertiary">
          <h3 className="text-primary font-medium truncate">
            {media.file_path.split('/').pop()}
          </h3>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out p-2 rounded cursor-pointer"
          >
            <i className="bi bi-x-lg icon-xl" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-center py-12 text-muted">Loading...</div>
          ) : error || !mediaUrl ? (
            <div className="text-center py-12 text-red-bright">
              Failed to load media file
            </div>
          ) : isVideo ? (
            <video
              ref={videoRef}
              src={mediaUrl}
              controls
              autoPlay
              onError={handleError}
              className="w-full max-h-[60vh] bg-bg2 rounded"
            >
              Your browser does not support video playback.
            </video>
          ) : (
            <div className="py-8">
              <div className="flex justify-center mb-4">
                <div className="w-24 h-24 rounded-full bg-bg2 flex items-center justify-center">
                  <i className="bi bi-music-note-beamed icon-2xl text-orange-bright" />
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
