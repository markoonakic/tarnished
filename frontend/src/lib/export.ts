import api from './api';
import { downloadFile } from './downloadFile';

export interface ExportJobStatus {
  job_id: string;
  status: string;
  stage?: string;
  percent: number;
  message?: string;
  result?: { filename?: string };
  error?: { error?: string };
}

export async function startZIPExportJob(): Promise<{
  job_id: string;
  status: string;
}> {
  const response = await api.post('/api/export/zip-jobs');
  return response.data;
}

export async function getZIPExportJobStatus(
  jobId: string
): Promise<ExportJobStatus> {
  const response = await api.get(`/api/export/zip-jobs/${jobId}`);
  return response.data;
}

export async function downloadZIPExportJob(jobId: string): Promise<void> {
  const response = await api.get(`/api/export/zip-jobs/${jobId}/download`, {
    responseType: 'blob',
  });
  const filename = `tarnished-export-${new Date().toISOString().slice(0, 10)}.zip`;
  downloadBlob(response.data, filename, 'application/zip');
}

export async function exportJSON(): Promise<void> {
  const response = await api.get('/api/export/json', { responseType: 'blob' });
  downloadBlob(response.data, 'applications.json', 'application/json');
}

export async function exportCSV(): Promise<void> {
  const response = await api.get('/api/export/csv', { responseType: 'blob' });
  downloadBlob(response.data, 'applications.csv', 'text/csv');
}

function downloadBlob(blob: Blob, filename: string, mimeType: string) {
  const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
  downloadFile(url, filename);
}
