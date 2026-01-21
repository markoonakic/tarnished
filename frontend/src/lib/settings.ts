import api from './api';
import type { Status, RoundType } from './types';

export async function listStatuses(): Promise<Status[]> {
  const response = await api.get('/api/statuses');
  return response.data;
}

export async function createStatus(data: { name: string; color?: string }): Promise<Status> {
  const response = await api.post('/api/statuses', data);
  return response.data;
}

export async function listRoundTypes(): Promise<RoundType[]> {
  const response = await api.get('/api/round-types');
  return response.data;
}

export async function createRoundType(data: { name: string }): Promise<RoundType> {
  const response = await api.post('/api/round-types', data);
  return response.data;
}
