import api from './api';
import type { APIKey, APIKeyCreateResponse, RoundType, Status } from './types';

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

export async function listAPIKeys(): Promise<APIKey[]> {
  const response = await api.get('/api/settings/api-keys');
  return response.data;
}

export async function createAPIKey(data: {
  label: string;
}): Promise<APIKeyCreateResponse> {
  const response = await api.post('/api/settings/api-keys', data);
  return response.data;
}

export async function updateAPIKey(
  id: string,
  data: { label: string }
): Promise<APIKey> {
  const response = await api.patch(`/api/settings/api-keys/${id}`, data);
  return response.data;
}

export async function deleteAPIKey(id: string): Promise<void> {
  await api.delete(`/api/settings/api-keys/${id}`);
}
