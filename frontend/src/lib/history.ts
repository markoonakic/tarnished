import api from './api';
import type { ApplicationStatusHistory } from './types';

export async function getApplicationHistory(
  applicationId: string
): Promise<ApplicationStatusHistory[]> {
  const response = await api.get(`/api/applications/${applicationId}/history`);
  return response.data;
}

export async function deleteHistoryEntry(
  applicationId: string,
  historyId: string
): Promise<void> {
  await api.delete(`/api/applications/${applicationId}/history/${historyId}`);
}
