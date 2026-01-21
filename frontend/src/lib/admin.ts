import api from './api';
import type { Application, Status, RoundType } from './types';

export interface User {
  id: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface AdminStats {
  total_users: number;
  total_applications: number;
  applications_by_status: { status: string; count: number }[];
}

export async function listUsers(): Promise<User[]> {
  const response = await api.get('/api/admin/users');
  return response.data;
}

export async function updateUser(
  userId: string,
  data: { is_admin?: boolean; is_active?: boolean }
): Promise<User> {
  const response = await api.put(`/api/admin/users/${userId}`, data);
  return response.data;
}

export async function getAdminStats(): Promise<AdminStats> {
  const response = await api.get('/api/admin/stats');
  return response.data;
}

export async function listAllApplications(params: {
  page?: number;
  per_page?: number;
  user_id?: string;
}): Promise<{ items: Application[]; total: number }> {
  const response = await api.get('/api/admin/applications', { params });
  return response.data;
}

export async function createDefaultStatus(data: {
  name: string;
  color: string;
  order?: number;
}): Promise<Status> {
  const response = await api.post('/api/admin/default-statuses', data);
  return response.data;
}

export async function createDefaultRoundType(data: { name: string }): Promise<RoundType> {
  const response = await api.post('/api/admin/default-round-types', data);
  return response.data;
}
