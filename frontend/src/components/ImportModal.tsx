import { useState, useRef, useEffect } from 'react';
import { validateImport, importData, connectToImportProgress, type ImportProgress } from '../lib/import';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (matches backend limit per file)

export default function ImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
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
      setError(`File too large (${(selected.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 100MB.`);
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
      setError(err instanceof Error ? err.message : 'Validation failed. Please check your file.');
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
      setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-bg0/80 flex items-center justify-center z-50"
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
        className="bg-bg1 rounded-lg max-w-md w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-tertiary">
          <h3 id="import-modal-title" className="text-primary font-medium">Import Data</h3>
          <button
            onClick={handleClose}
            disabled={importing}
            aria-label="Close modal"
            className="text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out p-2 rounded disabled:opacity-50 cursor-pointer"
          >
            <i className="bi bi-x-lg icon-xl" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {error && (
            <div className="bg-red-bright/20 border border-red-bright text-red-bright px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {progress ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-accent border-t-transparent mb-4"></div>
              <p className="text-primary">{progress.message || 'Importing...'}</p>
              <div className="w-full bg-tertiary rounded-full h-2 mt-4">
                <div
                  className="bg-accent h-2 rounded-full transition-all"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          ) : validation ? (
            <div>
              <h4 className="text-lg font-semibold text-primary mb-3">Import Summary</h4>
              <div className="bg-tertiary rounded-lg p-4 mb-4 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-secondary">
                  <span>Applications:</span>
                  <span className="text-primary text-right">{validation.summary.applications}</span>
                  <span>Rounds:</span>
                  <span className="text-primary text-right">{validation.summary.rounds}</span>
                  <span>Status Changes:</span>
                  <span className="text-primary text-right">{validation.summary.status_history}</span>
                  <span>Custom Statuses:</span>
                  <span className="text-primary text-right">{validation.summary.custom_statuses}</span>
                  <span>Custom Round Types:</span>
                  <span className="text-primary text-right">{validation.summary.custom_round_types}</span>
                  <span>Files:</span>
                  <span className="text-primary text-right">{validation.summary.files}</span>
                </div>
              </div>

              {validation.warnings.length > 0 && (
                <div className="bg-yellow/20 border border-yellow text-yellow px-4 py-3 rounded mb-4 text-sm">
                  {validation.warnings.map((w: string) => (
                    <div key={w}>Warning: {w}</div>
                  ))}
                </div>
              )}

              {validation.warnings.some((w: string) => w.includes('existing applications')) && (
                <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                    className="rounded bg-bg2 border-tertiary text-accent focus:ring-accent-bright cursor-pointer"
                  />
                  <span className="text-yellow">Replace existing data (warning: this deletes current applications)</span>
                </label>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setValidation(null)}
                  className="bg-transparent text-fg1 hover:bg-bg2 hover:text-fg0 transition-all duration-200 ease-in-out px-4 py-2 rounded-md flex-1 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium flex-1 cursor-pointer"
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
                className="w-full px-3 py-2 bg-bg2 text-fg1 focus:ring-1 focus:ring-accent-bright focus:outline-none transition-all duration-200 ease-in-out rounded"
              />

              {file && (
                <div className="mt-4">
                  <button
                    onClick={handleValidate}
                    disabled={validating}
                    className="bg-accent text-bg0 hover:bg-accent-bright transition-all duration-200 ease-in-out px-4 py-2 rounded-md font-medium disabled:opacity-50 w-full cursor-pointer"
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
