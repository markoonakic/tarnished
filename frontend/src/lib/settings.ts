import api from './api';
import type { APIKeyResponse, RoundType, Status } from './types';

export async function listStatuses(): Promise<Status[]> {
  const response = await api.get('/api/statuses');
  return response.data;
}

export async function createStatus(data: {
  name: string;
  color?: string;
}): Promise<Status> {
  const response = await api.post('/api/statuses', data);
  return response.data;
}

export async function updateStatus(
  id: string,
  data: { name?: string; color?: string }
): Promise<Status> {
  const response = await api.patch(`/api/statuses/${id}`, data);
  return response.data;
}

export async function deleteStatus(id: string): Promise<void> {
  await api.delete(`/api/statuses/${id}`);
}

export async function listRoundTypes(): Promise<RoundType[]> {
  const response = await api.get('/api/round-types');
  return response.data;
}

export async function createRoundType(data: {
  name: string;
}): Promise<RoundType> {
  const response = await api.post('/api/round-types', data);
  return response.data;
}

export async function updateRoundType(
  id: string,
  data: { name: string }
): Promise<RoundType> {
  const response = await api.patch(`/api/round-types/${id}`, data);
  return response.data;
}

export async function deleteRoundType(id: string): Promise<void> {
  await api.delete(`/api/round-types/${id}`);
}

/**
 * Get the current user's API key status.
 * Returns whether the user has an API key and a masked version if so.
 */
export async function getAPIKey(): Promise<APIKeyResponse> {
  const response = await api.get('/api/settings/api-key');
  return response.data;
}

/**
 * Regenerate the current user's API key.
 * Returns the new API key status with a masked version.
 */
export async function regenerateAPIKey(): Promise<APIKeyResponse> {
  const response = await api.post('/api/settings/api-key/regenerate');
  return response.data;
}
