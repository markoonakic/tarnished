export type TransferPhase =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'downloading'
  | 'complete'
  | 'failed'
  | 'cancelled';

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
  const verb = phase === 'uploading' ? 'Uploading' : 'Downloading';
  return {
    phase,
    progress,
    fileName,
    message: fileName ? `${verb} ${fileName}...` : `${verb}...`,
  };
}

export function createTransferStateFromJob(job: JobInput): TransferState {
  const progress = job.percent ?? 0;
  if (job.status === 'complete') {
    return {
      phase: 'ready',
      progress,
      message: job.message ?? 'Ready',
      result: job.result ?? undefined,
    };
  }

  if (job.status === 'failed') {
    return {
      phase: 'failed',
      progress,
      stage: job.stage ?? undefined,
      message: job.message ?? 'Transfer failed',
      error: job.error?.error ?? job.message ?? 'Transfer failed',
      result: job.result ?? undefined,
    };
  }

  return {
    phase: 'processing',
    progress,
    stage: job.stage ?? undefined,
    message: job.message ?? 'Processing...',
    result: job.result ?? undefined,
  };
}
