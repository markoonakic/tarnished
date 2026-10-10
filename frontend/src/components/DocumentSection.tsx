import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import DocumentTextFallback from './DocumentTextFallback';
import FileButton from './FileButton';
import { useState, type ReactNode } from 'react';
import {
  uploadCV,
  uploadCoverLetter,
  deleteCV,
  deleteCoverLetter,
  getSignedUrl,
} from '../lib/applications';
import type { Application } from '../lib/types';
import { API_BASE } from '../lib/api';
import ProgressBar from './ProgressBar';
import { isAxiosError } from 'axios';
import { errorMessage } from '@/lib/errorMessage';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

interface Props {
  application: Application;
  onUpdate: (app: Application) => void;
  children?: ReactNode;
}

export default function DocumentSection({
  application,
  onUpdate,
  children,
}: Props) {
  useTranslation();
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [justReplaced, setJustReplaced] = useState<string | null>(null);
  const [error, setError] = useState('');
  useUnsavedChanges(Boolean(uploading));

  async function handleUpload(
    type: 'cv' | 'cover-letter',
    file: File,
    isReplace = false
  ) {
    setUploading(type);
    setUploadingFile(file);
    setUploadProgress(0);
    setError('');

    try {
      let updated: Application;
      if (type === 'cv') {
        updated = await uploadCV(
          application.id,
          file,
          (loaded, total) => {
            setUploadProgress(
              total > 0 ? Math.round((loaded / total) * 100) : 0
            );
          },
          application.evidence_revision
        );
      } else {
        updated = await uploadCoverLetter(
          application.id,
          file,
          (loaded, total) => {
            setUploadProgress(
              total > 0 ? Math.round((loaded / total) * 100) : 0
            );
          },
          application.evidence_revision
        );
      }
      setUploadProgress(100);
      onUpdate(updated);
      if (isReplace) {
        setJustReplaced(type);
        setTimeout(() => setJustReplaced(null), 2000);
      }
      setTimeout(() => setUploadProgress(0), 500);
    } catch (error) {
      setError(
        isAxiosError(error) && error.response
          ? errorMessage(error.response.data, error.response.status)
          : t('Failed to upload {{type}}', { type: type })
      );
      setUploadProgress(0);
    } finally {
      setUploading(null);
      setUploadingFile(null);
    }
  }

  async function handleDelete(type: 'cv' | 'cover-letter') {
    if (!confirm(t('Delete this {{type}}?', { type: type }))) return;
    setError('');
    try {
      let updated: Application;
      if (type === 'cv') {
        updated = await deleteCV(application.id, application.evidence_revision);
      } else {
        updated = await deleteCoverLetter(
          application.id,
          application.evidence_revision
        );
      }
      onUpdate(updated);
    } catch (error) {
      setError(
        isAxiosError(error) && error.response
          ? errorMessage(error.response.data, error.response.status)
          : t('Failed to delete {{type}}', { type: type })
      );
    }
  }

  async function handlePreview(type: 'cv' | 'cover-letter') {
    try {
      const { url } = await getSignedUrl(application.id, type, 'inline');
      window.open(`${API_BASE}${url}`, '_blank');
    } catch {
      setError(t('Failed to get preview URL for {{type}}', { type: type }));
    }
  }

  function isPreviewable(path: string | null): boolean {
    if (!path) return false;
    const ext = path.split('.').pop()?.toLowerCase();
    return ext === 'pdf';
  }

  function renderDocRow(
    label: string,
    type: 'cv' | 'cover-letter',
    path: string | null
  ) {
    const hasFile = Boolean(path);
    const isUploading = uploading === type;
    const canPreview = isPreviewable(path);
    const wasJustReplaced = justReplaced === type;
    const isProgressActive =
      isUploading && uploadProgress > 0 && uploadProgress < 100;

    return (
      <div
        id={`document-${application.id}-${type === 'cv' ? 'cv' : 'cover_letter'}`}
        className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"
      >
        <span className="text-primary font-medium">{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          {hasFile ? (
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {isProgressActive && (
                <ProgressBar
                  progress={uploadProgress}
                  fileName={uploadingFile?.name}
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-sm ${wasJustReplaced ? 'text-accent-bright' : 'text-green-bright'}`}
                >
                  {wasJustReplaced ? t('Replaced!') : t('Uploaded')}
                </span>
                <Button
                  onClick={() => handlePreview(type)}
                  disabled={isUploading}
                  className="flex items-center gap-1.5"
                  title={canPreview ? t('Preview') : t('View/Download')}
                >
                  <i className="bi-eye icon-sm"></i>
                  {canPreview ? t('Preview') : t('View/Download')}
                </Button>
                <FileButton
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(type, file, true);
                  }}
                  disabled={isUploading}
                  className="flex items-center gap-1.5"
                >
                  <i className="bi-arrow-repeat icon-sm"></i>
                  {t('Replace')}
                </FileButton>
                <Button
                  variant="danger"
                  onClick={() => handleDelete(type)}
                  disabled={isUploading}
                  className="flex items-center gap-1.5"
                >
                  <i className="bi-trash icon-sm"></i>
                  {t('Delete')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {isProgressActive && (
                <ProgressBar
                  progress={uploadProgress}
                  fileName={uploadingFile?.name}
                />
              )}
              <FileButton
                variant="primary"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(type, file);
                }}
                disabled={isUploading}
                className="flex items-center gap-1.5"
              >
                <i className="bi-upload icon-sm"></i>
                {isUploading ? t('Uploading...') : t('Upload')}
              </FileButton>
            </div>
          )}
          <DocumentTextFallback
            applicationId={application.id}
            kind={type === 'cv' ? 'cv' : 'cover_letter'}
            revision={application.evidence_revision}
            onSaved={(revision) =>
              onUpdate({ ...application, evidence_revision: revision })
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg1 rounded-lg p-6">
      <h2 className="text-primary mb-4 text-lg font-semibold">
        {t('Documents')}
      </h2>

      {error && (
        <div className="bg-red-bright/20 border-red-bright text-red-bright mb-4 rounded border px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <>
        {renderDocRow(t('CV'), 'cv', application.cv_path)}
        {renderDocRow(
          t('Cover Letter'),
          'cover-letter',
          application.cover_letter_path
        )}
      </>
      {children}
    </div>
  );
}
