import { t, language } from '@/lib/i18n';
import { errorMessage } from './errorMessage';
import api, { safeErrorMessage } from './api';
import { invalidateEvidenceQueries } from './queryClient';
import {
  API_BASE,
  buildAuthenticatedEventSourceUrl,
  fetchWithAuth,
  getAccessToken,
  refreshAuthTokens,
} from './api';

export interface ImportWarning {
  code: string;
  count?: number;
  names?: string;
}

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
  warning_messages?: ImportWarning[];
  errors: string[];
}

export interface ImportProgress {
  status:
    | 'queued'
    | 'pending'
    | 'processing'
    | 'complete'
    | 'failed'
    | 'cancelled'
    | 'unknown';
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
  error?: {
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
    throw new Error(errorMessage(errorData, response.status));
  }

  const validation: ImportValidation = await response.json();
  if (!validation.valid) {
    throw new Error(
      language() === 'en'
        ? validation.errors
            .filter((error) => typeof error === 'string')
            .join('\n') || t('Validation failed')
        : t('Validation failed')
    );
  }
  return validation;
}

export async function getImportStatus(
  importId: string
): Promise<ImportProgress> {
  const { data } = await api.get<ImportProgress>(
    `/api/import/status/${importId}`
  );
  if (data.status === 'complete') invalidateEvidenceQueries();
  return data;
}

export async function importData(
  file: File,
  override: boolean,
  onUploadProgress?: (loaded: number, total: number) => void
): Promise<{ import_id: string; status: string; job_id: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('override', override.toString());

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const importUrl = API_BASE
      ? `${API_BASE}/api/import/import`
      : '/api/import/import';
    xhr.open('POST', importUrl);

    const token = getAccessToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onUploadProgress?.(event.loaded, event.total);
      }
    });

    xhr.onreadystatechange = async () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;

      try {
        const payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
          return;
        }

        if (xhr.status === 401) {
          const refreshedToken = await refreshAuthTokens();
          if (refreshedToken) {
            reject(
              new Error(t('Import authentication expired. Please retry.'))
            );
            return;
          }
        }

        reject(new Error(safeErrorMessage(payload.detail, t('Import failed'))));
      } catch {
        reject(new Error(t('Import failed')));
      }
    };

    xhr.onerror = () => reject(new Error(t('Import failed')));
    xhr.send(formData);
  });
}

export function connectToImportProgress(
  importId: string,
  onProgress: (progress: ImportProgress) => void,
  onTerminal: (progress: ImportProgress) => void
): EventSource {
  const eventSource = new EventSource(
    buildAuthenticatedEventSourceUrl(`/api/import/progress/${importId}`)
  );

  eventSource.addEventListener('progress', (e) => {
    const progress = JSON.parse(e.data) as ImportProgress;
    onProgress(progress);

    if (['complete', 'failed', 'cancelled'].includes(progress.status)) {
      eventSource.close();
      if (progress.status === 'complete') invalidateEvidenceQueries();
      onTerminal(progress);
    }
  });

  function interrupted() {
    eventSource.close();
    onTerminal({
      status: 'unknown',
      percent: 0,
      message: t(
        'Progress connection lost. The import may still be running. Check its status before starting another import.'
      ),
    });
  }

  eventSource.addEventListener('timeout', interrupted);
  eventSource.onerror = interrupted;

  return eventSource;
}
