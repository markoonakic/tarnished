import api from './api';

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
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
