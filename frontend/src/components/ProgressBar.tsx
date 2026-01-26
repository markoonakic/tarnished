interface Props {
  progress: number; // 0-100
  fileName?: string;
  showPercentage?: boolean;
}

export default function ProgressBar({ progress, fileName, showPercentage = true }: Props) {
  const isComplete = progress >= 100;

  return (
    <div>
      {fileName && (
        <div className="text-sm text-primary mb-2 truncate">{fileName}</div>
      )}
      <div className="w-full h-2 bg-tertiary rounded-sm overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isComplete ? 'bg-accent-green' : 'bg-accent-aqua'
          }`}
          style={{ width: `${Math.min(progress, 100)}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {showPercentage && (
        <div className="text-xs text-muted text-right mt-1">
          {isComplete ? 'Upload complete' : `${Math.round(progress)}%`}
        </div>
      )}
    </div>
  );
}
