import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import InterviewFeedback from './InterviewFeedback';
import HelpTip from './HelpTip';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@/lib/displayDate';
import { roundTypeLabel } from '@/lib/referenceLabels';
import { getEffectiveTimeZone } from '@/lib/roundDateTime';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import TranscriptEditor from './TranscriptEditor';
import TranscriptionPanel from './TranscriptionPanel';
import FileButton from './FileButton';
import Modal from './Modal';
import { useState } from 'react';
import { isAxiosError } from 'axios';
import { uploadMedia, deleteMedia, getMediaSignedUrl } from '../lib/rounds';
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
  showRoundHeader?: boolean;
}

export default function InterviewRecording({
  round,
  onEdit,
  onDelete,
  onMediaChange,
  showRoundHeader = false,
}: Props) {
  useTranslation();
  const preferences = useUserPreferences();
  const zone =
    (preferences.data ? getEffectiveTimeZone(preferences.data) : undefined) ??
    undefined;
  const preparationCount = Object.values(round.preparation ?? {}).reduce(
    (sum, list) => sum + (list?.length ?? 0),
    0
  );
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadingMediaFile, setUploadingMediaFile] = useState<File | null>(
    null
  );
  const [uploadingMediaProgress, setUploadingMediaProgress] = useState(0);
  const [pendingMedia, setPendingMedia] = useState<{
    file: File;
    generation: number;
    replaceId?: string;
  } | null>(null);
  const [mediaError, setMediaError] = useState('');
  const [deleteConflict, setDeleteConflict] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcribingMedia, setTranscribingMedia] = useState<string | null>(
    null
  );
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackOpened, setFeedbackOpened] = useState(false);
  const [playingMedia, setPlayingMedia] = useState<RoundMedia | null>(null);

  async function handleMediaUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    replaceId?: string
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Pending state owns the File. Reset the native chooser so selecting the
    // same file after explicit conflict recovery fires change again.
    e.target.value = '';
    const pending = {
      file,
      generation: round.media_generation ?? 0,
      replaceId,
    };
    setPendingMedia(pending);
    await sendMedia(pending);
  }

  async function sendMedia(pending: NonNullable<typeof pendingMedia>) {
    if (pending.file.size > 1_000_000_000) {
      setMediaError(
        t('Recording exceeds 1,000,000,000 bytes. Choose a smaller recording.')
      );
      return;
    }
    setUploading(true);
    setMediaError('');
    setUploadingMediaFile(pending.file);
    setUploadingMediaProgress(0);
    try {
      await uploadMedia(
        round.id,
        pending.file,
        (loaded, total) => {
          setUploadingMediaProgress(
            total > 0 ? Math.round((loaded / total) * 100) : 0
          );
        },
        pending.generation,
        pending.replaceId
      );
      setPendingMedia(null);
      onMediaChange();
    } catch (error) {
      const detail = isAxiosError(error) ? error.response?.data?.detail : null;
      setMediaError(
        isAxiosError(error) && error.response?.status === 409
          ? t(
              'Recordings changed. Retrying cannot resolve this conflict. Reload and review recordings, then discard this pending upload and select the file and replacement again.'
            )
          : typeof detail === 'string'
            ? detail
            : t(
                'Recording upload failed. Check current recordings before retrying; your selected file is kept.'
              )
      );
    } finally {
      setUploading(false);
      setUploadingMediaProgress(0);
      setUploadingMediaFile(null);
    }
  }

  async function handleMediaDelete(mediaId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (
      !confirm(
        t(
          'Delete this recording and the transcript/corrections created from it? Separately pasted or uploaded transcripts are kept.'
        )
      )
    )
      return;
    try {
      await deleteMedia(mediaId, round.media_generation ?? 0);
      setDeleteConflict(false);
      onMediaChange();
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        setDeleteConflict(true);
      } else {
        toast.error(t('Failed to delete media'));
      }
    }
  }

  async function handleMediaDownload(media: RoundMedia, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const apiBase = API_BASE;
      const { url } = await getMediaSignedUrl(media.id, 'attachment');
      // Let the browser stream the attachment; never buffer a 1-GB Blob in JS.
      downloadFile(`${apiBase}${url}`, media.original_filename || 'recording');
    } catch {
      toast.error(t('Failed to download media'));
    }
  }

  return (
    <div
      id={`round-${round.id}`}
      className={showRoundHeader ? 'bg-bg2 rounded-lg p-4' : undefined}
    >
      {playingMedia && (
        <MediaPlayer
          media={playingMedia}
          onClose={() => setPlayingMedia(null)}
        />
      )}

      <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        {showRoundHeader && (
          <div>
            <h4 className="text-primary font-medium">
              {roundTypeLabel(round.round_type)}
            </h4>
            <p className="text-muted text-sm">
              {t('Scheduled:')}{' '}
              {round.scheduled_at
                ? formatDateTime(round.scheduled_at, zone)
                : '—'}
            </p>
            {round.completed_at && (
              <p className="text-muted text-sm">
                {t('Completed:')} {formatDateTime(round.completed_at, zone)}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {showRoundHeader && (
            <span
              className={`mr-2 text-sm font-medium ${round.outcome === 'passed' ? 'text-green' : round.outcome === 'failed' ? 'text-red' : 'text-yellow'}`}
            >
              {t('tasks.outcome.' + (round.outcome || 'pending'))}
            </span>
          )}
          <button
            onClick={() => {
              setFeedbackOpened(true);
              setShowFeedback(true);
            }}
            className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
          >
            <i className="bi-stars icon-sm mr-1" aria-hidden="true" />
            {t('Interview feedback')}
          </button>
          {showRoundHeader && (
            <>
              <button
                onClick={onEdit}
                aria-label={t('Edit round')}
                title={t('Edit')}
                className="text-muted hover:text-fg1 hover:bg-bg2 focus:ring-accent cursor-pointer rounded p-1.5 transition-all duration-200 ease-in-out focus:ring-2"
              >
                <i className="bi-pencil icon-md" />
              </button>
              <button
                onClick={onDelete}
                aria-label={t('Delete round')}
                title={t('Delete')}
                className="text-muted hover:text-fg1 hover:bg-bg2 focus:ring-accent cursor-pointer rounded p-1.5 transition-all duration-200 ease-in-out focus:ring-2"
              >
                <i className="bi-trash icon-md" />
              </button>
            </>
          )}
        </div>
      </div>
      {showRoundHeader && (
        <>
          <div className="text-muted mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              <i
                className={`bi ${round.mode === 'video' ? 'bi-camera-video' : round.mode === 'phone' ? 'bi-telephone' : 'bi-geo-alt'} mr-2`}
                aria-hidden="true"
              />
              {t('tasks.participantsCount', {
                count: round.contact_ids?.length ?? 0,
              })}{' '}
              · {t('tasks.preparationCount', { count: preparationCount })}
            </span>
            <Link
              to={`/interviews/${round.id}`}
              className="text-accent hover:text-accent-bright focus:ring-accent cursor-pointer text-sm transition-all duration-200 ease-in-out focus:ring-2"
            >
              {t('tasks.openInterview')} →
            </Link>
          </div>
          {round.notes_summary && (
            <p className="text-secondary mb-3 text-sm whitespace-pre-wrap">
              {round.notes_summary}
            </p>
          )}
        </>
      )}
      <div className="border-tertiary border-t pt-3">
        <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <span className="text-muted flex items-center gap-2 text-sm">
            {t('Media Files')}{' '}
            <HelpTip label={t('Media Files')}>
              {t('Audio or video · up to 1 GB / 2 hours')}
            </HelpTip>
          </span>
          <FileButton
            accept=".mp4,.webm,.mov,.mp3,.m4a,.wav,.ogg"
            onChange={(e) => void handleMediaUpload(e)}
            disabled={uploading}
            className="bg-accent text-bg0 hover:bg-accent-bright focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
          >
            <i className="bi-plus-circle icon-sm"></i>
            {uploading ? t('Uploading...') : t('Add Media')}
          </FileButton>
        </div>

        {mediaError && (
          <div role="alert" className="text-red-bright mb-2 text-sm">
            {mediaError}
          </div>
        )}
        {deleteConflict && (
          <div role="alert" className="text-red-bright mb-2 text-sm">
            {t(
              'Recordings changed. Nothing was deleted. Reload and review recordings before deciding to delete again.'
            )}
          </div>
        )}
        {(pendingMedia || deleteConflict) && !uploading && (
          <button
            type="button"
            onClick={onMediaChange}
            className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
          >
            <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
            {t('Reload recordings')}
          </button>
        )}
        {pendingMedia && !uploading && (
          <div className="mb-2 text-sm">
            <p>
              {t('Pending:')} {pendingMedia.file.name}
              {t(
                '. Existing media/transcripts remain available. A lost response may mean the upload succeeded; review before retrying.'
              )}
            </p>
            <button
              type="button"
              onClick={() => void sendMedia(pendingMedia)}
              className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
            >
              <i className="bi-arrow-clockwise icon-sm" aria-hidden="true" />
              {t('Retry recording upload')}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingMedia(null);
                setMediaError('');
              }}
              className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
            >
              <i className="bi-x-lg icon-sm" aria-hidden="true" />
              {t('Discard pending upload')}
            </button>
          </div>
        )}
        {uploading && (
          <p role="status" className="text-muted text-sm">
            {uploadingMediaProgress >= 100
              ? t('Recording sent. Checking the file…')
              : t('Uploading recording...')}
          </p>
        )}
        {uploadingMediaProgress > 0 && uploadingMediaProgress < 100 && (
          <div className="mb-2">
            <ProgressBar
              progress={uploadingMediaProgress}
              fileName={uploadingMediaFile?.name}
            />
          </div>
        )}

        {round.media.length > 0 ? (
          <div className="space-y-2">
            {round.media.map((m) => (
              <div key={m.id} className="bg-bg3 space-y-2 rounded px-3 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  {m.media_type === 'video' ? (
                    <i className="bi-camera-video icon-md text-purple-bright flex-shrink-0" />
                  ) : (
                    <i className="bi-music-note-beamed icon-md text-orange-bright flex-shrink-0" />
                  )}
                  <span className="text-primary truncate text-sm">
                    {m.original_filename || m.file_path.split('/').pop()}
                  </span>
                </div>
                <p className="text-muted text-xs">
                  {m.byte_count != null &&
                    `${(m.byte_count / 1_000_000).toFixed(1)} MB`}
                  {m.probed_duration_seconds != null &&
                    m.validation === 'audio_decode_check' &&
                    ` · ${Math.ceil(m.probed_duration_seconds / 60)} min`}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setTranscribingMedia(m.id)}
                    className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                  >
                    <i
                      className="bi-file-text icon-sm mr-1"
                      aria-hidden="true"
                    />
                    {t('Transcribe')}
                  </button>
                  <FileButton
                    accept=".mp4,.webm,.mov,.mp3,.m4a,.wav,.ogg"
                    disabled={uploading}
                    onChange={(e) => void handleMediaUpload(e, m.id)}
                    className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                  >
                    <i className="bi-pencil icon-sm" aria-hidden="true" />
                    {t('Replace recording')}
                  </FileButton>
                  <button
                    disabled={m.validation !== 'audio_decode_check'}
                    onClick={() => setPlayingMedia(m)}
                    className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                    title={
                      m.validation === 'audio_decode_check'
                        ? t('Play')
                        : t(
                            '· Duration unverified. Transcribe to check this recording and enable playback.'
                          )
                    }
                  >
                    <i className="bi-play-fill icon-md" />
                    {t('Play')}
                  </button>
                  <button
                    onClick={(e) => handleMediaDownload(m, e)}
                    className="text-fg1 hover:bg-bg2 hover:text-fg0 focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                    title={t('Download')}
                  >
                    <i className="bi-download icon-sm" />
                    {t('Download')}
                  </button>
                  <button
                    disabled={uploading}
                    onClick={(e) => handleMediaDelete(m.id, e)}
                    className="text-red hover:bg-bg2 hover:text-red-bright focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
                    title={t('Delete')}
                  >
                    <i className="bi-trash icon-sm text-red-bright" />
                    {t('Delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted text-sm">{t('No media files')}</p>
        )}
      </div>

      {transcribingMedia && (
        <Modal
          label={t('Transcribe recording')}
          onClose={() => setTranscribingMedia(null)}
        >
          <div className="bg-bg1 mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-primary text-xl font-semibold">
                {t('Transcribe recording')}
              </h2>
              <button
                aria-label={t('Close transcription')}
                onClick={() => setTranscribingMedia(null)}
                className="text-muted hover:text-fg1 hover:bg-bg2 focus:ring-accent cursor-pointer rounded p-1.5 transition-all duration-200 ease-in-out focus:ring-2"
                title={t('Close transcription')}
              >
                <i className="bi-x-lg icon-lg" aria-hidden="true" />
              </button>
            </div>
            <TranscriptionPanel
              round={round}
              initialMediaId={transcribingMedia}
              onChange={onMediaChange}
              onResult={() => {
                setTranscribingMedia(null);
                setEditingTranscript(true);
              }}
            />
          </div>
        </Modal>
      )}

      <div className="border-tertiary mt-3 border-t pt-3">
        <p className="text-muted mb-2 text-sm">
          {round.has_current_transcript
            ? t('Editable transcript available')
            : round.transcript_path
              ? t('Transcript attachment available')
              : t('No transcript yet')}
        </p>
        <button
          type="button"
          onClick={() => setEditingTranscript(true)}
          className="bg-accent text-bg0 hover:bg-accent-bright focus:ring-accent flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out focus:ring-2 disabled:opacity-50"
        >
          <i className="bi-plus-lg icon-sm" aria-hidden="true" />
          {round.has_current_transcript || round.transcript_path
            ? t('Read transcript')
            : t('Add transcript')}
        </button>
        {round.transcript_summary && (
          <p className="text-secondary mt-2 text-sm whitespace-pre-wrap">
            {t('Round transcript summary:')} {round.transcript_summary}
          </p>
        )}
        {editingTranscript && (
          <TranscriptEditor
            roundId={round.id}
            onClose={() => setEditingTranscript(false)}
            onFeedback={() => {
              setEditingTranscript(false);
              setFeedbackOpened(true);
              setShowFeedback(true);
            }}
            onChange={onMediaChange}
          />
        )}
      </div>
      {feedbackOpened && (
        <div hidden={!showFeedback}>
          <InterviewFeedback
            round={round}
            onClose={() => setShowFeedback(false)}
          />
        </div>
      )}
    </div>
  );
}
