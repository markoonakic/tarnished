import { useState } from 'react';
import {
  uploadCV,
  uploadCoverLetter,
  deleteCV,
  deleteCoverLetter,
  getSignedUrl,
} from '../lib/applications';
import type { Application } from '../lib/types';
// TODO: downloadFile imported but unused - may be needed for future download functionality
// import { downloadFile } from '../lib/downloadFile';
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

  async function handleUpload(
    type: 'cv' | 'cover-letter',
    file: File,
    isReplace = false
  ) {
    setUploading(type);
    setUploadingFile(file);
    setUploadProgress(0);
    setError('');

    const progressInterval = setInterval(() => {
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
      clearInterval(progressInterval);
      setUploadProgress(100);
      onUpdate(updated);
      if (isReplace) {
        setJustReplaced(type);
        setTimeout(() => setJustReplaced(null), 2000);
      }
      setTimeout(() => setUploadProgress(0), 500);
    } catch {
      clearInterval(progressInterval);
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
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      window.open(`${baseUrl}${url}`, '_blank');
    } catch {
      setError(`Failed to get preview URL for ${type}`);
    }
  }

  // TODO: handleDownload is currently unused but may be needed for future download functionality
  // async function handleDownload(type: 'cv' | 'cover-letter') {
  //   try {
  //     const { url } = await getSignedUrl(application.id, type, 'attachment');
  //     const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  //     const fullUrl = `${baseUrl}${url}`;
  //
  //     const response = await fetch(fullUrl);
  //     if (!response.ok) throw new Error('Download failed');
  //
  //     // Extract filename from Content-Disposition header
  //     const contentDisposition = response.headers.get('Content-Disposition');
  //     let filename = `${type}.pdf`;
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
  //     setError(`Failed to download ${type}`);
  //   }
  // }

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
    const isProgressActive = isUploading && uploadProgress > 0 && uploadProgress < 100;

    return (
      <div className="flex items-center justify-between py-3">
        <span className="text-primary font-medium w-28">{label}</span>
        {hasFile ? (
          <div className="flex flex-col gap-2 items-end">
            {isProgressActive && <ProgressBar progress={uploadProgress} fileName={uploadingFile?.name} />}
            <div className="flex items-center gap-2">
              <span className={`text-sm ${wasJustReplaced ? 'text-accent-aqua' : 'text-accent-green'}`}>
                {wasJustReplaced ? 'Replaced!' : 'Uploaded'}
              </span>
              <button
                onClick={() => handlePreview(type)}
                disabled={!canPreview || isUploading}
                className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm disabled:opacity-50"
                title={canPreview ? 'Preview' : 'Preview not available for this file type'}
              >
                <i className="bi-eye text-sm"></i>
                Preview
              </button>
              <label className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-3 py-1.5 rounded disabled:opacity-50 flex items-center gap-1.5 text-sm">
                <i className="bi-arrow-repeat text-sm"></i>
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
                className="bg-transparent text-red hover:bg-bg2 hover:text-red-bright transition-all duration-200 ease-in-out px-3 py-1.5 rounded flex items-center gap-1.5 text-sm disabled:opacity-50"
              >
                <i className="bi-trash text-sm"></i>
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 items-end">
            {isProgressActive && <ProgressBar progress={uploadProgress} fileName={uploadingFile?.name} />}
            <label className="bg-aqua text-bg0 hover:bg-aqua-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium disabled:opacity-50 flex items-center gap-1.5">
              <i className="bi-upload"></i>
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
      <h2 className="text-lg font-semibold text-primary mb-4">Documents</h2>

      {error && (
        <div className="bg-accent-red/20 border border-accent-red text-accent-red px-3 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      <>
        {renderDocRow('CV', 'cv', application.cv_path)}
        {renderDocRow('Cover Letter', 'cover-letter', application.cover_letter_path)}
      </>
    </div>
  );
}
