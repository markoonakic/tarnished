import api from './api';
import type { Round, RoundCreate, RoundUpdate } from './types';

export async function createRound(applicationId: string, data: RoundCreate): Promise<Round> {
  const response = await api.post(`/api/applications/${applicationId}/rounds`, data);
  return response.data;
}

export async function updateRound(roundId: string, data: RoundUpdate): Promise<Round> {
  const response = await api.put(`/api/rounds/${roundId}`, data);
  return response.data;
}

export async function deleteRound(roundId: string): Promise<void> {
  await api.delete(`/api/rounds/${roundId}`);
}

export async function uploadMedia(roundId: string, file: File): Promise<Round> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/api/rounds/${roundId}/media`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function deleteMedia(mediaId: string): Promise<void> {
  await api.delete(`/api/media/${mediaId}`);
}
