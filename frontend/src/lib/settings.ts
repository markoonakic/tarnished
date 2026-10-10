import { invalidateEvidenceQueries } from './queryClient';
import api from './api';
import type {
  APIKey,
  APIKeyCreateResponse,
  RoundType,
  Status,
  StatusMeaning,
} from './types';

export async function listStatuses(): Promise<Status[]> {
  const response = await api.get('/api/statuses');
  return response.data;
}

export async function createStatus(data: {
  name: string;
  meaning?: StatusMeaning;
  color?: string;
}): Promise<Status> {
  const response = await api.post('/api/statuses', data);
  invalidateEvidenceQueries();
  return response.data;
}

export async function updateStatus(
  id: string,
  data: {
    name?: string;
    color?: string;
    meaning?: StatusMeaning;
    expected_name?: string;
    expected_color?: string;
    expected_meaning?: StatusMeaning;
  }
): Promise<Status> {
  const response = await api.patch(`/api/statuses/${id}`, data);
  invalidateEvidenceQueries();
  return response.data;
}

export async function deleteStatus(id: string, status?: Status): Promise<void> {
  await api.delete(`/api/statuses/${id}`, {
    params: {
      expected_name: status?.name,
      expected_color: status?.color,
      expected_meaning: status?.meaning,
    },
  });
  invalidateEvidenceQueries();
}

export async function listRoundTypes(): Promise<RoundType[]> {
  const response = await api.get('/api/round-types');
  return response.data;
}

export async function createRoundType(data: {
  name: string;
}): Promise<RoundType> {
  const response = await api.post('/api/round-types', data);
  invalidateEvidenceQueries();
  return response.data;
}

export async function updateRoundType(
  id: string,
  data: { name: string; expected_name?: string }
): Promise<RoundType> {
  const response = await api.patch(`/api/round-types/${id}`, data);
  invalidateEvidenceQueries();
  return response.data;
}

export async function deleteRoundType(
  id: string,
  roundType?: RoundType
): Promise<void> {
  await api.delete(`/api/round-types/${id}`, {
    params: { expected_name: roundType?.name },
  });
  invalidateEvidenceQueries();
}

export async function listAPIKeys(): Promise<APIKey[]> {
  const response = await api.get('/api/settings/api-keys');
  return response.data;
}

export async function createAPIKey(data: {
  label: string;
  preset: string;
  scopes?: string[];
}): Promise<APIKeyCreateResponse> {
  const response = await api.post('/api/settings/api-keys', data);
  return response.data;
}

export async function updateAPIKey(
  id: string,
  data: { label?: string; preset?: string; scopes?: string[] }
): Promise<APIKey> {
  const response = await api.patch(`/api/settings/api-keys/${id}`, data);
  return response.data;
}

export async function deleteAPIKey(id: string): Promise<void> {
  await api.delete(`/api/settings/api-keys/${id}`);
}
