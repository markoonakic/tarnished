import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import FileButton from './FileButton';
import { useToastContext } from '../contexts/ToastContext';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { useState, useRef, useEffect } from 'react';
import {
  validateImport,
  importData,
  connectToImportProgress,
  getImportStatus,
  type ImportProgress,
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
  useTranslation();
  const toast = useToastContext();
  const progressConnection = useRef<EventSource | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validation, setValidation] = useState<{
    summary: Record<string, number>;
    warnings: string[];
    warning_messages?: { code: string; count?: number; names?: string }[];
  } | null>(null);
  const [transferState, setTransferState] = useState<TransferState | null>(
    null
  );
  const [error, setError] = useState('');
  const [override, setOverride] = useState(false);

  const reset = () => {
    progressConnection.current?.close();
    progressConnection.current = null;
    setJobId(null);
    setFile(null);
    setValidation(null);
    setTransferState(null);
    setError('');
    setOverride(false);
  };

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen]);

  useEffect(() => () => progressConnection.current?.close(), []);

  function handleClose() {
    if (importing || validating || checking) return;
    reset();
    onClose();
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setValidation(null);
    setOverride(false);
    if (!selected.name.toLowerCase().endsWith('.zip')) {
      setError(t('Please select a ZIP file'));
      setFile(null);
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setError(
        t('File too large ({{value0}}MB). Maximum archive size is 1GB.', {
          value0: (selected.size / 1024 / 1024).toFixed(1),
        })
      );
      setFile(null);
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
          : t('Validation failed. Please check your file.')
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

      setJobId(import_id);
      progressConnection.current = connectToImportProgress(
        import_id,
        (prog) => {
          setTransferState(createTransferStateFromJob(prog));
        },
        finishImport
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Import failed. Please try again.')
      );
      setImporting(false);
    }
  };

  function finishImport(progress: ImportProgress) {
    setImporting(false);
    const state = createTransferStateFromJob(progress);
    setTransferState(state);
    if (progress.status === 'complete') {
      const count = progress.result?.skipped_reports ?? 0;
      if (count) toast.warning(t('import.skippedReports', { count }));
      onSuccess();
      reset();
      return;
    }
    setError(
      state.error || state.message || t('Import failed. Please try again.')
    );
  }

  async function checkStatus() {
    if (!jobId) return;
    setChecking(true);
    setError('');
    try {
      const progress = await getImportStatus(jobId);
      setTransferState(createTransferStateFromJob(progress));
      if (['complete', 'failed', 'cancelled'].includes(progress.status))
        finishImport(progress);
    } catch {
      setError(
        t(
          'Could not check import status. The import may still be running. Try checking again before starting another import.'
        )
      );
    } finally {
      setChecking(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Modal
      onClose={handleClose}
      labelledBy="import-modal-title"
      busy={importing || validating || checking}
    >
      <div
        className="bg-bg1 mx-4 flex max-h-[90vh] w-full max-w-md flex-col rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-tertiary flex flex-shrink-0 items-center justify-between border-b p-4">
          <h3 id="import-modal-title" className="text-primary font-medium">
            {t('Import Data')}
          </h3>
          <Button
            variant="icon"
            onClick={handleClose}
            disabled={importing || validating || checking}
            aria-label={t('Close modal')}
          >
            <i className="bi bi-x-lg icon-xl" />
          </Button>
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
              {jobId && !importing && (
                <Button
                  type="button"
                  disabled={checking}
                  onClick={checkStatus}
                  className="mt-4 underline"
                >
                  {checking
                    ? t('Checking status...')
                    : t('Check import status')}
                </Button>
              )}
            </div>
          ) : validation ? (
            <div>
              <h4 className="text-primary mb-3 text-lg font-semibold">
                {t('Import Summary')}
              </h4>
              <div className="bg-tertiary mb-4 rounded-lg p-4 text-sm">
                <div className="text-secondary grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <span>{t('Applications:')}</span>
                  <span className="text-primary text-right">
                    {validation.summary.applications}
                  </span>
                  <span>{t('Job Leads:')}</span>
                  <span className="text-primary text-right">
                    {validation.summary.job_leads || 0}
                  </span>
                  <span>{t('Rounds:')}</span>
                  <span className="text-primary text-right">
                    {validation.summary.rounds}
                  </span>
                  <span>{t('Status Changes:')}</span>
                  <span className="text-primary text-right">
                    {validation.summary.status_history}
                  </span>
                  <span>{t('Custom Statuses:')}</span>
                  <span className="text-primary text-right">
                    {validation.summary.custom_statuses}
                  </span>
                  <span>{t('Custom Round Types:')}</span>
                  <span className="text-primary text-right">
                    {validation.summary.custom_round_types}
                  </span>
                  <span>{t('Files:')}</span>
                  <span className="text-primary text-right">
                    {validation.summary.files}
                  </span>
                </div>
              </div>

              {validation.warnings.length > 0 && (
                <div className="bg-yellow/20 border-yellow text-yellow mb-4 rounded border px-4 py-3 text-sm">
                  {(
                    validation.warning_messages ??
                    validation.warnings.map(() => ({ code: 'unknown' }))
                  ).map((warning, index) => (
                    <div key={index}>
                      {t('Warning:')}{' '}
                      {warning.code === 'existing_applications'
                        ? t(
                            'Existing applications: {{count}}. Import adds to these unless Replace is selected.',
                            warning
                          )
                        : warning.code === 'new_statuses'
                          ? t('New statuses: {{count}} · {{names}}', warning)
                          : warning.code === 'new_round_types'
                            ? t(
                                'New round types: {{count}} · {{names}}',
                                warning
                              )
                            : t('Review the archive before importing.')}
                    </div>
                  ))}
                </div>
              )}

              {(validation.warning_messages?.some(
                (warning) => warning.code === 'existing_applications'
              ) ??
                validation.warnings.some((warning) =>
                  warning.includes('existing applications')
                )) && (
                <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                    className="bg-bg2 border-tertiary text-accent focus:ring-accent-bright cursor-pointer rounded"
                  />
                  <span className="text-yellow">
                    {t(
                      'Replace existing data (warning: this deletes current applications, job leads, and custom statuses)'
                    )}
                  </span>
                </label>
              )}

              <div className="flex gap-3">
                <Button onClick={() => setValidation(null)} className="flex-1">
                  {t('Cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleImport}
                  className="flex-1"
                >
                  {t('Import Data')}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-secondary mb-4 text-sm">
                {t(
                  'Select a ZIP export file to import your job application data. Large archives can take a while to upload and process. Files larger than 100MB inside the ZIP may still fail backend validation.'
                )}
              </p>

              <FileButton
                aria-label={t('ZIP archive')}
                disabled={validating}
                accept=".zip"
                onChange={(event) => {
                  handleFileSelect(event);
                  event.currentTarget.value = '';
                }}
                className="w-full text-left"
              >
                {file?.name || t('Choose ZIP archive')}
              </FileButton>

              {file && (
                <div className="mt-4">
                  <Button
                    variant="primary"
                    onClick={handleValidate}
                    disabled={validating}
                    className="w-full"
                  >
                    {validating ? t('Validating...') : t('Validate')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
