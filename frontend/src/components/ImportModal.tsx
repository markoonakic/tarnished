import { useState, useRef, useEffect, useCallback } from 'react';
import {
  validateImport,
  importData,
  connectToImportProgress,
} from '../lib/import';
import {
  createTransferStateFromJob,
  createTransferStateFromUpload,
  type TransferState,
} from '../lib/transfer';
import TransferProgressPanel from './transfer/TransferProgressPanel';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB total ZIP limit (matches backend ZIP validation)

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
  const [transferState, setTransferState] = useState<TransferState | null>(
    null
  );
  const [error, setError] = useState('');
  const [override, setOverride] = useState(false);

  const reset = () => {
    setFile(null);
    setValidation(null);
    setTransferState(null);
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

  const handleClose = useCallback(() => {
    if (importing) return;
    reset();
    onClose();
  }, [importing, onClose]);

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !importing) handleClose();
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, importing, handleClose]);

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
        `File too large (${(selected.size / 1024 / 1024).toFixed(1)}MB). Maximum archive size is 1GB.`
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
    setTransferState(
      createTransferStateFromUpload({
        phase: 'uploading',
        loaded: 0,
        total: file.size,
        fileName: file.name,
      })
    );

    try {
      const { import_id } = await importData(
        file,
        override,
        (loaded, total) => {
          setTransferState(
            createTransferStateFromUpload({
              phase: 'uploading',
              loaded,
              total,
              fileName: file.name,
            })
          );
        }
      );

      connectToImportProgress(
        import_id,
        (prog) => {
          setTransferState(createTransferStateFromJob(prog));
        },
        (finalProgress) => {
          setImporting(false);
          if (finalProgress.status === 'complete') {
            onSuccess();
            reset();
            return;
          }
          setError(
            finalProgress.message ||
              finalProgress.error?.error ||
              'Import failed. Please try again.'
          );
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

          {transferState ? (
            <div className="py-8">
              <TransferProgressPanel state={transferState} />
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
                Large archives can take a while to upload and process. Files
                larger than 100MB inside the ZIP may still fail backend
                validation.
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
