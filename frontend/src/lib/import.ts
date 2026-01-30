const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface ImportValidation {
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

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token');
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export async function validateImport(file: File): Promise<ImportValidation> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/api/import/validate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Validation failed');
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

  const response = await fetch(`${API_BASE}/api/import/import`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Import failed');
  }

  return response.json();
}

export function connectToImportProgress(
  importId: string,
  onProgress: (progress: ImportProgress) => void,
  onComplete: () => void
): EventSource {
  const token = localStorage.getItem('access_token');
  const url = new URL(`${API_BASE}/api/import/progress/${importId}`);
  if (token) {
    url.searchParams.append('token', token);
  }

  const eventSource = new EventSource(url.toString());

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
