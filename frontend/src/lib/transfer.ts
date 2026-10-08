import { t, language } from '@/lib/i18n';
type TransferPhase =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'downloading'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'unknown';

export interface TransferState {
  phase: TransferPhase;
  progress: number;
  stage?: string;
  fileName?: string;
  message?: string;
  result?: Record<string, unknown>;
  error?: string;
}

interface UploadInput {
  phase: 'uploading' | 'downloading';
  loaded: number;
  total: number;
  fileName?: string;
}

interface JobInput {
  status: string;
  stage?: string | null;
  percent?: number | null;
  message?: string | null;
  result?: Record<string, unknown> | null;
  error?: { error?: string } | null;
}

export function createTransferStateFromUpload({
  phase,
  loaded,
  total,
  fileName,
}: UploadInput): TransferState {
  const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
  const verb = phase === 'uploading' ? t('Uploading') : t('Downloading');
  return {
    phase,
    progress,
    fileName,
    message: fileName ? `${verb} ${fileName}...` : `${verb}...`,
  };
}

export function createTransferStateFromJob(job: JobInput): TransferState {
  const stages = {
    validating: 'Validating ZIP file...',
    extracting: 'Extracting files...',
    clearing: 'Removing existing data...',
    importing: 'Importing data...',
    finalizing: 'Finalizing...',
    queued: 'Queued for processing',
    exporting: 'Collecting export data...',
    archiving: 'Preparing ZIP archive...',
  } as const;
  const progress = job.percent ?? 0;
  const message = language() === 'en' ? job.message : undefined;
  const stageMessage =
    job.stage && Object.hasOwn(stages, job.stage)
      ? t(stages[job.stage as keyof typeof stages])
      : t('Processing...');
  if (job.status === 'complete') {
    return {
      phase: 'ready',
      progress,
      message: message ?? t('Ready'),
      result: job.result ?? undefined,
    };
  }

  if (job.status === 'cancelled' || job.status === 'unknown') {
    return {
      phase: job.status,
      progress,
      message:
        message ??
        (job.status === 'cancelled'
          ? t('Transfer cancelled')
          : t('Transfer status unknown')),
    };
  }

  if (job.status === 'failed') {
    return {
      phase: 'failed',
      progress,
      stage: job.stage ?? undefined,
      message: t('Transfer failed'),
      error: t('Transfer failed'),
      result: job.result ?? undefined,
    };
  }

  return {
    phase: 'processing',
    progress,
    stage: job.stage ?? undefined,
    message: message ?? stageMessage,
    result: job.result ?? undefined,
  };
}
