import { invalidateEvidenceQueries } from './queryClient';
import api, { withAxiosTimeZoneHeaders } from './api';
import { queryParams, type JobQuery } from './apiV030';
import type {
  Application,
  ApplicationCreate,
  ApplicationUpdate,
  ApplicationListResponse,
} from './types';

export interface ListParams extends JobQuery {
  page?: number;
  per_page?: number;
  status_id?: string;
  source?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  sort?: string;
}

interface ApplicationSourcesResponse {
  sources: string[];
}

export async function listApplications(
  params: ListParams = {}
): Promise<ApplicationListResponse> {
  const response = await api.get('/api/applications', {
    params: queryParams(params),
  });
  return response.data;
}

export async function getApplication(id: string): Promise<Application> {
  const response = await api.get(`/api/applications/${id}`);
  return response.data;
}

export async function getApplicationSources(): Promise<string[]> {
  const response = await api.get<ApplicationSourcesResponse>(
    '/api/applications/sources'
  );
  return response.data.sources;
}

export async function createApplication(
  data: ApplicationCreate,
  requestKey?: string
): Promise<Application> {
  const response = await api.post('/api/applications', data, {
    headers: withAxiosTimeZoneHeaders({ 'Idempotency-Key': requestKey }),
  });
  invalidateEvidenceQueries();
  return response.data;
}

export async function updateApplication(
  id: string,
  data: ApplicationUpdate
): Promise<Application> {
  const response = await api.patch(`/api/applications/${id}`, data);
  invalidateEvidenceQueries();
  return response.data;
}

export async function deleteApplication(id: string): Promise<void> {
  await api.delete(`/api/applications/${id}`);
  invalidateEvidenceQueries();
}

export async function uploadCV(
  applicationId: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  expectedRevision?: number
): Promise<Application> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(
    `/api/applications/${applicationId}/cv`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Expected-Evidence-Revision': expectedRevision,
      },
      onUploadProgress: (event) => {
        if (event.total) {
          onProgress?.(event.loaded, event.total);
        }
      },
    }
  );
  invalidateEvidenceQueries();
  return response.data;
}

export async function deleteCV(
  applicationId: string,
  expectedRevision?: number
): Promise<Application> {
  const response = await api.delete(`/api/applications/${applicationId}/cv`, {
    headers: { 'Expected-Evidence-Revision': expectedRevision },
  });
  invalidateEvidenceQueries();
  return response.data;
}

export async function uploadCoverLetter(
  applicationId: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  expectedRevision?: number
): Promise<Application> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(
    `/api/applications/${applicationId}/cover-letter`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Expected-Evidence-Revision': expectedRevision,
      },
      onUploadProgress: (event) => {
        if (event.total) {
          onProgress?.(event.loaded, event.total);
        }
      },
    }
  );
  invalidateEvidenceQueries();
  return response.data;
}

export async function deleteCoverLetter(
  applicationId: string,
  expectedRevision?: number
): Promise<Application> {
  const response = await api.delete(
    `/api/applications/${applicationId}/cover-letter`,
    { headers: { 'Expected-Evidence-Revision': expectedRevision } }
  );
  invalidateEvidenceQueries();
  return response.data;
}

export async function getSignedUrl(
  applicationId: string,
  docType: 'cv' | 'cover-letter' | 'transcript',
  disposition: 'inline' | 'attachment' = 'inline'
): Promise<{ url: string; expires_in: number }> {
  const response = await api.get(
    `/api/files/${applicationId}/${docType}/signed`,
    {
      params: { disposition },
    }
  );
  return response.data;
}
