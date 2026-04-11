import api from './api';

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

export async function exportZIP(): Promise<void> {
  const { job_id } = await startZIPExportJob();

  while (true) {
    const status = await getZIPExportJobStatus(job_id);
    if (status.status === 'complete') {
      await downloadZIPExportJob(job_id);
      return;
    }
    if (status.status === 'failed') {
      throw new Error(
        status.message || status.error?.error || 'Failed to export data'
      );
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
}

function downloadBlob(blob: Blob, filename: string, mimeType: string) {
  const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
