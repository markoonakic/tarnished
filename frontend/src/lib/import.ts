import { buildAuthenticatedEventSourceUrl, fetchWithAuth } from './api';

interface ImportValidation {
  valid: boolean;
  summary: {
    applications: number;
    rounds: number;
    status_history: number;
    custom_statuses: number;
    custom_round_types: number;
    files: number;
  };
  warnings: string[];
  errors: string[];
}

export interface ImportProgress {
  status: 'pending' | 'processing' | 'complete' | 'unknown';
  stage?: string;
  percent: number;
  message?: string;
  success?: boolean;
  result?: {
    applications?: number;
    rounds?: number;
    status_history?: number;
    files?: number;
    error?: string;
  };
}

export async function validateImport(file: File): Promise<ImportValidation> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetchWithAuth('/api/import/validate', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.errors?.join(', ') || 'Validation failed'
    );
  }

  return response.json();
}

export async function importData(
  file: File,
  override: boolean
): Promise<{ import_id: string; status: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('override', override.toString());

  const response = await fetchWithAuth('/api/import/import', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Import failed');
  }

  return response.json();
}

export function connectToImportProgress(
  importId: string,
  onProgress: (progress: ImportProgress) => void,
  onComplete: () => void
): EventSource {
  const eventSource = new EventSource(
    buildAuthenticatedEventSourceUrl(`/api/import/progress/${importId}`)
  );

  eventSource.addEventListener('progress', (e) => {
    const progress = JSON.parse(e.data) as ImportProgress;
    onProgress(progress);

    if (progress.status === 'complete') {
      eventSource.close();
      onComplete();
    }
  });

  eventSource.onerror = () => {
    eventSource.close();
  };

  return eventSource;
}
