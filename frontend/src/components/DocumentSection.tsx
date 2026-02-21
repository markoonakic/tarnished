import { useState, useRef, useEffect } from 'react';
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

interface Props {
  application: Application;
  onUpdate: (app: Application) => void;
}

export default function DocumentSection({ application, onUpdate }: Props) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [justReplaced, setJustReplaced] = useState<string | null>(null);
  const [error, setError] = useState('');
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  async function handleUpload(
    type: 'cv' | 'cover-letter',
    file: File,
    isReplace = false
  ) {
    setUploading(type);
    setUploadingFile(file);
    setUploadProgress(0);
    setError('');

    progressRef.current = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 100);

    try {
      let updated: Application;
      if (type === 'cv') {
        updated = await uploadCV(application.id, file);
      } else {
        updated = await uploadCoverLetter(application.id, file);
      }
      if (progressRef.current) clearInterval(progressRef.current);
      setUploadProgress(100);
      onUpdate(updated);
      if (isReplace) {
        setJustReplaced(type);
        setTimeout(() => setJustReplaced(null), 2000);
      }
      setTimeout(() => setUploadProgress(0), 500);
    } catch {
      if (progressRef.current) clearInterval(progressRef.current);
      setError(`Failed to upload ${type}`);
      setUploadProgress(0);
    } finally {
      setUploading(null);
      setUploadingFile(null);
    }
  }

  async function handleDelete(type: 'cv' | 'cover-letter') {
    if (!confirm(`Delete this ${type}?`)) return;
    setError('');
    try {
      let updated: Application;
      if (type === 'cv') {
        updated = await deleteCV(application.id);
      } else {
        updated = await deleteCoverLetter(application.id);
      }
      onUpdate(updated);
    } catch {
      setError(`Failed to delete ${type}`);
    }
  }

  async function handlePreview(type: 'cv' | 'cover-letter') {
    try {
      const { url } = await getSignedUrl(application.id, type, 'inline');
      window.open(`${API_BASE}${url}`, '_blank');
    } catch {
      setError(`Failed to get preview URL for ${type}`);
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
      <div className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center">
        <span className="text-primary font-medium">{label}</span>
        {hasFile ? (
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {isProgressActive && (
              <ProgressBar
                progress={uploadProgress}
                fileName={uploadingFile?.name}
              />
            )}
            <div className="flex items-center gap-2">
              <span
                className={`text-sm ${wasJustReplaced ? 'text-accent-bright' : 'text-green-bright'}`}
              >
                {wasJustReplaced ? 'Replaced!' : 'Uploaded'}
              </span>
              <button
                onClick={() => handlePreview(type)}
                disabled={!canPreview || isUploading}
                className="text-fg1 hover:bg-bg2 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out disabled:opacity-50"
                title={
                  canPreview
                    ? 'Preview'
                    : 'Preview not available for this file type'
                }
              >
                <i className="bi-eye icon-sm"></i>
                Preview
              </button>
              <label className="text-fg1 hover:bg-bg2 hover:text-fg0 flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out disabled:opacity-50">
                <i className="bi-arrow-repeat icon-sm"></i>
                Replace
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(type, file, true);
                  }}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
              <button
                onClick={() => handleDelete(type)}
                disabled={isUploading}
                className="text-red hover:bg-bg2 hover:text-red-bright flex cursor-pointer items-center gap-1.5 rounded bg-transparent px-3 py-1.5 text-sm transition-all duration-200 ease-in-out disabled:opacity-50"
              >
                <i className="bi-trash icon-sm"></i>
                Delete
              </button>
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
            <label className="bg-accent text-bg0 hover:bg-accent-bright flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50">
              <i className="bi-upload icon-sm"></i>
              {isUploading ? 'Uploading...' : 'Upload'}
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(type, file);
                }}
                className="hidden"
                disabled={isUploading}
              />
            </label>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-bg1 rounded-lg p-6">
      <h2 className="text-primary mb-4 text-lg font-semibold">Documents</h2>

      {error && (
        <div className="bg-red-bright/20 border-red-bright text-red-bright mb-4 rounded border px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <>
        {renderDocRow('CV', 'cv', application.cv_path)}
        {renderDocRow(
          'Cover Letter',
          'cover-letter',
          application.cover_letter_path
        )}
      </>
    </div>
  );
}
