import { useState } from 'react';
import {
  uploadCV,
  uploadCoverLetter,
  deleteCV,
  deleteCoverLetter,
  getSignedUrl,
} from '../lib/applications';
import type { Application } from '../lib/types';
import { downloadFile } from '../lib/downloadFile';

interface Props {
  application: Application;
  onUpdate: (app: Application) => void;
}

export default function DocumentSection({ application, onUpdate }: Props) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [justReplaced, setJustReplaced] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleUpload(
    type: 'cv' | 'cover-letter',
    file: File,
    isReplace = false
  ) {
    setUploading(type);
    setError('');
    try {
      let updated: Application;
      if (type === 'cv') {
        updated = await uploadCV(application.id, file);
      } else {
        updated = await uploadCoverLetter(application.id, file);
      }
      onUpdate(updated);
      if (isReplace) {
        setJustReplaced(type);
        setTimeout(() => setJustReplaced(null), 2000);
      }
    } catch {
      setError(`Failed to upload ${type}`);
    } finally {
      setUploading(null);
    }
  }

  async function handleDelete(type: 'cv' | 'cover-letter') {
    if (!confirm(`Remove this ${type}?`)) return;
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

  async function handleDownload(type: 'cv' | 'cover-letter') {
    try {
      const { url } = await getSignedUrl(application.id, type, 'attachment');
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const fullUrl = `${baseUrl}${url}`;

      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error('Download failed');

      // Extract filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${type}.pdf`;
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
      setError(`Failed to download ${type}`);
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

    return (
      <div className="flex items-center justify-between py-3 border-b border-tertiary last:border-0">
        <span className="text-primary font-medium w-28">{label}</span>
        {hasFile ? (
          <div className="flex items-center gap-2">
            <span className={`text-sm ${wasJustReplaced ? 'text-accent-aqua' : 'text-accent-green'}`}>
              {wasJustReplaced ? 'Replaced!' : 'Uploaded'}
            </span>
            <button
              onClick={() => handlePreview(type)}
              disabled={!canPreview}
              className="px-4 py-2 bg-tertiary text-primary rounded hover:bg-muted disabled:opacity-50 transition-all duration-200"
              title={canPreview ? 'Preview' : 'Preview not available for this file type'}
            >
              Preview
            </button>
            <button
              onClick={() => handleDownload(type)}
              className="px-4 py-2 bg-tertiary text-primary rounded hover:bg-muted disabled:opacity-50 transition-all duration-200"
            >
              Download
            </button>
            <label className="px-4 py-2 bg-tertiary text-primary rounded hover:bg-muted disabled:opacity-50 transition-all duration-200 cursor-pointer">
              Replace
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(type, file, true);
                }}
                className="hidden"
              />
            </label>
            <button
              onClick={() => handleDelete(type)}
              className="px-4 py-2 bg-tertiary text-accent-red rounded hover:bg-red-900/20 disabled:opacity-50 transition-all duration-200"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="px-4 py-2 bg-accent-aqua text-bg-primary rounded font-medium hover:opacity-90 disabled:opacity-50 transition-all duration-200 cursor-pointer">
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
        )}
      </div>
    );
  }

  return (
    <div className="bg-secondary rounded-lg p-6">
      <h2 className="text-lg font-semibold text-primary mb-4">Documents</h2>

      {error && (
        <div className="bg-accent-red/20 border border-accent-red text-accent-red px-3 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {renderDocRow('CV', 'cv', application.cv_path)}
      {renderDocRow('Cover Letter', 'cover-letter', application.cover_letter_path)}
    </div>
  );
}
