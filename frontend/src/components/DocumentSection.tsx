import { useState } from 'react';
import {
  uploadCV,
  uploadCoverLetter,
  uploadTranscript,
  deleteCV,
  deleteCoverLetter,
  deleteTranscript,
  getSignedUrl,
  updateApplication,
} from '../lib/applications';
import type { Application } from '../lib/types';

interface Props {
  application: Application;
  onUpdate: (app: Application) => void;
}

export default function DocumentSection({ application, onUpdate }: Props) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [transcriptSummary, setTranscriptSummary] = useState(application.transcript_summary || '');
  const [editingSummary, setEditingSummary] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);

  async function handleUpload(
    type: 'cv' | 'cover-letter' | 'transcript',
    file: File
  ) {
    setUploading(type);
    setError('');
    try {
      let updated: Application;
      if (type === 'cv') {
        updated = await uploadCV(application.id, file);
      } else if (type === 'cover-letter') {
        updated = await uploadCoverLetter(application.id, file);
      } else {
        updated = await uploadTranscript(application.id, file);
      }
      onUpdate(updated);
    } catch {
      setError(`Failed to upload ${type}`);
    } finally {
      setUploading(null);
    }
  }

  async function handleDelete(type: 'cv' | 'cover-letter' | 'transcript') {
    if (!confirm(`Remove this ${type}?`)) return;
    setError('');
    try {
      let updated: Application;
      if (type === 'cv') {
        updated = await deleteCV(application.id);
      } else if (type === 'cover-letter') {
        updated = await deleteCoverLetter(application.id);
      } else {
        updated = await deleteTranscript(application.id);
      }
      onUpdate(updated);
    } catch {
      setError(`Failed to delete ${type}`);
    }
  }

  async function handlePreview(type: 'cv' | 'cover-letter' | 'transcript') {
    try {
      const { url } = await getSignedUrl(application.id, type, 'inline');
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      window.open(`${baseUrl}${url}`, '_blank');
    } catch {
      setError(`Failed to get preview URL for ${type}`);
    }
  }

  async function handleDownload(type: 'cv' | 'cover-letter' | 'transcript') {
    try {
      const { url } = await getSignedUrl(application.id, type, 'attachment');
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const link = document.createElement('a');
      link.href = `${baseUrl}${url}`;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      setError(`Failed to download ${type}`);
    }
  }

  async function handleSaveSummary() {
    setSavingSummary(true);
    try {
      const updated = await updateApplication(application.id, {
        transcript_summary: transcriptSummary || null,
      });
      onUpdate(updated);
      setEditingSummary(false);
    } catch {
      setError('Failed to save summary');
    } finally {
      setSavingSummary(false);
    }
  }

  function handleCancelSummary() {
    setTranscriptSummary(application.transcript_summary || '');
    setEditingSummary(false);
  }

  function isPreviewable(path: string | null): boolean {
    if (!path) return false;
    const ext = path.split('.').pop()?.toLowerCase();
    return ext === 'pdf';
  }

  function renderDocRow(
    label: string,
    type: 'cv' | 'cover-letter' | 'transcript',
    path: string | null
  ) {
    const hasFile = Boolean(path);
    const isUploading = uploading === type;
    const canPreview = isPreviewable(path);

    return (
      <div className="flex items-center justify-between py-3 border-b border-tertiary last:border-0">
        <span className="text-primary font-medium w-28">{label}</span>
        {hasFile ? (
          <div className="flex items-center gap-2">
            <span className="text-accent-green text-sm">Uploaded</span>
            <button
              onClick={() => handlePreview(type)}
              disabled={!canPreview}
              className={`px-2 py-1 rounded text-xs ${
                canPreview
                  ? 'bg-tertiary text-primary hover:bg-muted'
                  : 'bg-tertiary/50 text-muted cursor-not-allowed'
              }`}
              title={canPreview ? 'Preview' : 'Preview not available for this file type'}
            >
              Preview
            </button>
            <button
              onClick={() => handleDownload(type)}
              className="px-2 py-1 bg-tertiary text-primary rounded text-xs hover:bg-muted"
            >
              Download
            </button>
            <label className="px-2 py-1 bg-tertiary text-primary rounded text-xs hover:bg-muted cursor-pointer">
              Replace
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(type, file);
                }}
                className="hidden"
              />
            </label>
            <button
              onClick={() => handleDelete(type)}
              className="px-2 py-1 bg-accent-red/20 text-accent-red rounded text-xs hover:bg-accent-red/30"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="px-3 py-1 bg-accent-aqua text-bg-primary rounded text-sm hover:opacity-90 cursor-pointer">
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
      {renderDocRow('Transcript', 'transcript', application.transcript_path)}

      {application.transcript_path && (
        <div className="mt-4 pt-4 border-t border-tertiary">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">Transcript Summary</span>
            {!editingSummary && (
              <button
                onClick={() => setEditingSummary(true)}
                className="text-sm text-accent-aqua hover:underline"
              >
                {application.transcript_summary ? 'Edit' : 'Add Summary'}
              </button>
            )}
          </div>
          {editingSummary ? (
            <>
              <textarea
                value={transcriptSummary}
                onChange={(e) => setTranscriptSummary(e.target.value)}
                rows={3}
                placeholder="Key points: GPA, relevant coursework, certifications..."
                className="w-full px-3 py-2 bg-tertiary border border-muted rounded text-primary placeholder-muted focus:outline-none focus:border-accent-aqua resize-y"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleSaveSummary}
                  disabled={savingSummary}
                  className="px-3 py-1 bg-accent-aqua text-bg-primary rounded text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {savingSummary ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancelSummary}
                  disabled={savingSummary}
                  className="px-3 py-1 bg-tertiary text-primary rounded text-sm hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : application.transcript_summary ? (
            <p className="text-primary text-sm whitespace-pre-wrap">{application.transcript_summary}</p>
          ) : (
            <p className="text-muted text-sm italic">No summary added</p>
          )}
        </div>
      )}
    </div>
  );
}
