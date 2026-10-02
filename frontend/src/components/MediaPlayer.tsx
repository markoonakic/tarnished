import Modal from './Modal';
import { useState, useEffect } from 'react';
import type { RoundMedia } from '../lib/types';
import { getMediaSignedUrl } from '../lib/rounds';
import { API_BASE } from '../lib/api';

interface Props {
  media: RoundMedia;
  onClose: () => void;
}

export default function MediaPlayer({ media, onClose }: Props) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const isVideo = media.media_type === 'video';
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setMediaUrl(null);
    async function fetchSignedUrl() {
      try {
        const { url } = await getMediaSignedUrl(media.id, 'inline');
        if (active) setMediaUrl(`${API_BASE}${url}`);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchSignedUrl();
    return () => {
      active = false;
    };
  }, [media.id]);

  function handleError() {
    setError(true);
  }

  return (
    <Modal onClose={onClose} label="Media player">
      <div
        className="bg-bg1 mx-4 w-full max-w-4xl overflow-hidden rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-tertiary flex items-center justify-between border-b p-4">
          <h3 className="text-primary truncate font-medium">
            {media.original_filename || media.file_path.split('/').pop()}
          </h3>
          <button
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
    </Modal>
  );
}
