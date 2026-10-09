import HelpTip from '../HelpTip';
import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  downloadZIPExportJob,
  exportJSON,
  exportCSV,
  getZIPExportJobStatus,
  startZIPExportJob,
} from '../../lib/export';
import {
  createTransferStateFromJob,
  type TransferState,
} from '../../lib/transfer';
import TransferProgressPanel from '../transfer/TransferProgressPanel';
import { SettingsBackLink } from './SettingsLayout';

export default function SettingsExport() {
  useTranslation();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [zipTransferState, setZipTransferState] =
    useState<TransferState | null>(null);

  async function handleExportJSON() {
    setExporting(true);
    try {
      await exportJSON();
    } catch {
      setError(t('Failed to export data'));
    } finally {
      setExporting(false);
    }
  }

  async function handleExportCSV() {
    setExporting(true);
    try {
      await exportCSV();
    } catch {
      setError(t('Failed to export data'));
    } finally {
      setExporting(false);
    }
  }

  async function handleExportZIP() {
    setExporting(true);
    setError('');
    try {
      const { job_id } = await startZIPExportJob();
      while (true) {
        const job = await getZIPExportJobStatus(job_id);
        const state = createTransferStateFromJob(job);
        setZipTransferState(state);

        if (job.status === 'complete') {
          await downloadZIPExportJob(job_id);
          setZipTransferState(null);
          return;
        }

        if (job.status === 'failed') {
          throw new Error(
            job.message || job.error?.error || t('Failed to export data')
          );
        }

        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
    } catch {
      setError(t('Failed to export data'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>

      <div className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 mb-4 flex items-center gap-2 text-xl font-bold">
          {t('Data Export')}{' '}
          <HelpTip label={t('Data Export')}>
            {t('Download all your application data for backup or analysis.')}
          </HelpTip>
        </h2>

        {error && (
          <div className="bg-red-bright/20 border-red-bright text-red-bright mb-6 rounded border px-4 py-3">
            {error}
          </div>
        )}

        {zipTransferState && (
          <div className="mb-4">
            <TransferProgressPanel state={zipTransferState} />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={handleExportJSON}
            disabled={exporting}
          >
            {exporting ? t('Exporting...') : t('Export JSON')}
          </Button>
          <Button
            variant="primary"
            onClick={handleExportCSV}
            disabled={exporting}
          >
            {exporting ? t('Exporting...') : t('Export CSV')}
          </Button>
          <Button
            variant="primary"
            onClick={handleExportZIP}
            disabled={exporting}
          >
            {exporting ? t('Exporting...') : t('Export ZIP (with files)')}
          </Button>
        </div>
      </div>
    </>
  );
}
