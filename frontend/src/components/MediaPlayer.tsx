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
      className="bg-bg0/80 fixed inset-0 z-50 flex items-center justify-center"
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
      <div
        ref={modalRef}
        className="bg-bg1 mx-4 w-full max-w-4xl overflow-hidden rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-tertiary flex items-center justify-between border-b p-4">
          <h3 className="text-primary truncate font-medium">
            {media.file_path.split('/').pop()}
          </h3>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded p-2 transition-all duration-200 ease-in-out"
          >
            <i className="bi bi-x-lg icon-xl" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-muted py-12 text-center">Loading...</div>
          ) : error || !mediaUrl ? (
            <div className="text-red-bright py-12 text-center">
              Failed to load media file
            </div>
          ) : isVideo ? (
            <video
              ref={videoRef}
              src={mediaUrl}
              controls
              autoPlay
              onError={handleError}
              className="bg-bg2 max-h-[60vh] w-full rounded"
            >
              Your browser does not support video playback.
            </video>
          ) : (
            <div className="py-8">
              <div className="mb-4 flex justify-center">
                <div className="bg-bg2 flex h-24 w-24 items-center justify-center rounded-full">
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

        <div className="text-muted px-4 pb-4 text-sm">
          Uploaded: {new Date(media.uploaded_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
