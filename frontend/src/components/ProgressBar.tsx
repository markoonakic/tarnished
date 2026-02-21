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
  const isComplete = progress >= 100;

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
          style={{ width: `${Math.min(progress, 100)}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {showPercentage && (
        <div className="text-muted mt-1 text-right text-xs">
          {isComplete ? 'Upload complete' : `${Math.round(progress)}%`}
        </div>
      )}
    </div>
  );
}
