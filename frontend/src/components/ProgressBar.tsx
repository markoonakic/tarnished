import { t } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
interface Props {
  progress: number; // 0-100
  fileName?: string;
  showPercentage?: boolean;
}

export default function ProgressBar({
  progress,
  fileName,
  showPercentage = true,
}: Props) {
  useTranslation();
  const percent = Math.max(0, Math.min(progress, 100));
  const isComplete = percent === 100;

  return (
    <div>
      {fileName && (
        <div className="text-fg1 mb-2 truncate text-sm">{fileName}</div>
      )}
      <div className="bg-tertiary h-2 w-full overflow-hidden rounded-sm">
        <div
          className={`h-full transition-all duration-300 ${
            isComplete ? 'bg-green' : 'bg-accent'
          }`}
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-label={
            fileName
              ? t('Progress for {{fileName}}', { fileName: fileName })
              : t('Transfer progress')
          }
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {showPercentage && (
        <div className="text-muted mt-1 text-right text-xs">
          {Math.round(percent)}%
        </div>
      )}
    </div>
  );
}
