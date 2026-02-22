import { useState, useRef, useEffect } from 'react';
import {
  validateImport,
  importData,
  connectToImportProgress,
  type ImportProgress,
} from '../lib/import';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (matches backend limit per file)

export default function ImportModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validation, setValidation] = useState<{
    summary: Record<string, number>;
    warnings: string[];
  } | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState('');
  const [override, setOverride] = useState(false);

  const reset = () => {
    setFile(null);
    setValidation(null);
    setProgress(null);
    setError('');
    setOverride(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !importing) handleClose();
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, importing]);

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.endsWith('.zip')) {
      setError('Please select a ZIP file');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setError(
        `File too large (${(selected.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 100MB.`
      );
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setFile(selected);
    setError('');
  };

  const handleValidate = async () => {
    if (!file) return;

    setValidating(true);
    setError('');

    try {
      const result = await validateImport(file);
      setValidation(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Validation failed. Please check your file.'
      );
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setError('');

    try {
      const { import_id } = await importData(file, override);

      connectToImportProgress(
        import_id,
        (prog) => {
          setProgress(prog);
        },
        () => {
          setImporting(false);
          onSuccess();
          reset();
        }
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Import failed. Please try again.'
      );
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="bg-bg0/80 fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          handleClose();
        }
      }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div
        className="bg-bg1 mx-4 flex max-h-[90vh] w-full max-w-md flex-col rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-tertiary flex flex-shrink-0 items-center justify-between border-b p-4">
          <h3 id="import-modal-title" className="text-primary font-medium">
            Import Data
          </h3>
          <button
            onClick={handleClose}
            disabled={importing}
            aria-label="Close modal"
            className="text-fg1 hover:bg-bg2 hover:text-fg0 cursor-pointer rounded p-2 transition-all duration-200 ease-in-out disabled:opacity-50"
          >
            <i className="bi bi-x-lg icon-xl" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-bright/20 border-red-bright text-red-bright mb-4 rounded border px-4 py-3">
              {error}
            </div>
          )}

          {progress ? (
            <div className="py-8 text-center">
              <div className="border-accent mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"></div>
              <p className="text-primary">
                {progress.message || 'Importing...'}
              </p>
              <div className="bg-tertiary mt-4 h-2 w-full rounded-full">
                <div
                  className="bg-accent h-2 rounded-full transition-all"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          ) : validation ? (
            <div>
              <h4 className="text-primary mb-3 text-lg font-semibold">
                Import Summary
              </h4>
              <div className="bg-tertiary mb-4 rounded-lg p-4 text-sm">
                <div className="text-secondary grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <span>Applications:</span>
                  <span className="text-primary text-right">
                    {validation.summary.applications}
                  </span>
                  <span>Job Leads:</span>
                  <span className="text-primary text-right">
                    {validation.summary.job_leads || 0}
                  </span>
                  <span>Rounds:</span>
                  <span className="text-primary text-right">
                    {validation.summary.rounds}
                  </span>
                  <span>Status Changes:</span>
                  <span className="text-primary text-right">
                    {validation.summary.status_history}
                  </span>
                  <span>Custom Statuses:</span>
                  <span className="text-primary text-right">
                    {validation.summary.custom_statuses}
                  </span>
                  <span>Custom Round Types:</span>
                  <span className="text-primary text-right">
                    {validation.summary.custom_round_types}
                  </span>
                  <span>Files:</span>
                  <span className="text-primary text-right">
                    {validation.summary.files}
                  </span>
                </div>
              </div>

              {validation.warnings.length > 0 && (
                <div className="bg-yellow/20 border-yellow text-yellow mb-4 rounded border px-4 py-3 text-sm">
                  {validation.warnings.map((w: string) => (
                    <div key={w}>Warning: {w}</div>
                  ))}
                </div>
              )}

              {validation.warnings.some((w: string) =>
                w.includes('existing applications')
              ) && (
                <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                    className="bg-bg2 border-tertiary text-accent focus:ring-accent-bright cursor-pointer rounded"
                  />
                  <span className="text-yellow">
                    Replace existing data (warning: this deletes current
                    applications, job leads, and custom statuses)
                  </span>
                </label>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setValidation(null)}
                  className="text-fg1 hover:bg-bg2 hover:text-fg0 flex-1 cursor-pointer rounded-md bg-transparent px-4 py-2 transition-all duration-200 ease-in-out"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="bg-accent text-bg0 hover:bg-accent-bright flex-1 cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out"
                >
                  Import Data
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-secondary mb-4 text-sm">
                Select a ZIP export file to import your job application data.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                className="bg-bg2 text-fg1 focus:ring-accent-bright w-full rounded px-3 py-2 transition-all duration-200 ease-in-out focus:ring-1 focus:outline-none"
              />

              {file && (
                <div className="mt-4">
                  <button
                    onClick={handleValidate}
                    disabled={validating}
                    className="bg-accent text-bg0 hover:bg-accent-bright w-full cursor-pointer rounded-md px-4 py-2 font-medium transition-all duration-200 ease-in-out disabled:opacity-50"
                  >
                    {validating ? 'Validating...' : 'Validate'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
