import api from './api';
import type { Application, ApplicationCreate, ApplicationUpdate, ApplicationListResponse } from './types';

export interface ListParams {
  page?: number;
  per_page?: number;
  status_id?: string;
  source?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

export async function listApplications(params: ListParams = {}): Promise<ApplicationListResponse> {
  const response = await api.get('/api/applications', { params });
  return response.data;
}

export async function getApplication(id: string): Promise<Application> {
  const response = await api.get(`/api/applications/${id}`);
  return response.data;
}

export async function createApplication(data: ApplicationCreate): Promise<Application> {
  const response = await api.post('/api/applications', data);
  return response.data;
}

export async function updateApplication(id: string, data: ApplicationUpdate): Promise<Application> {
  const response = await api.patch(`/api/applications/${id}`, data);
  return response.data;
}

export async function deleteApplication(id: string): Promise<void> {
  await api.delete(`/api/applications/${id}`);
}

export async function uploadCV(applicationId: string, file: File): Promise<Application> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/api/applications/${applicationId}/cv`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function deleteCV(applicationId: string): Promise<Application> {
  const response = await api.delete(`/api/applications/${applicationId}/cv`);
  return response.data;
}

export async function uploadCoverLetter(applicationId: string, file: File): Promise<Application> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/api/applications/${applicationId}/cover-letter`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function deleteCoverLetter(applicationId: string): Promise<Application> {
  const response = await api.delete(`/api/applications/${applicationId}/cover-letter`);
  return response.data;
}


export async function getSignedUrl(
  applicationId: string,
  docType: 'cv' | 'cover-letter' | 'transcript',
  disposition: 'inline' | 'attachment' = 'inline'
): Promise<{ url: string; expires_in: number }> {
  const response = await api.get(`/api/files/${applicationId}/${docType}/signed`, {
    params: { disposition }
  });
  return response.data;
}
