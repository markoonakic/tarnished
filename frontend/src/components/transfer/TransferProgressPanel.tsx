import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import ProgressBar from '../ProgressBar';
import type { TransferState } from '@/lib/transfer';

interface TransferProgressPanelProps {
  state: TransferState;
}

export default function TransferProgressPanel({
  state,
}: TransferProgressPanelProps) {
  useTranslation();
  return (
    <div className="bg-bg2 rounded-lg p-4 text-left">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-fg1 text-sm font-medium">{state.message}</p>
          {state.stage && (
            <p className="text-fg1/70 text-xs">
              {t('Stage:')}{' '}
              {t('transfer.stage.' + state.stage, {
                defaultValue: t('Processing...'),
              })}
            </p>
          )}
        </div>
        <span className="text-fg1/70 text-xs uppercase">
          {t('transfer.phase.' + state.phase)}
        </span>
      </div>
      <ProgressBar
        progress={state.progress}
        fileName={state.fileName}
        showPercentage
      />
      {state.error && (
        <p className="text-red-bright mt-2 text-sm">{state.error}</p>
      )}
    </div>
  );
}
