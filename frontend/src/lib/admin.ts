import api from './api';
import type { User } from './types';

export interface AdminUser extends User {
  created_at: string;
}

export interface AdminStats {
  total_users: number;
  total_applications: number;
  applications_by_status: { status: string; count: number }[];
}

export interface AdminUserListResponse {
  items: AdminUser[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export async function listUsers(params?: {
  page?: number;
  per_page?: number;
}): Promise<AdminUserListResponse> {
  const response = await api.get('/api/admin/users', { params });
  return response.data;
}

export async function updateUser(
  userId: string,
  data: { is_admin?: boolean; is_active?: boolean; password?: string }
): Promise<AdminUser> {
  const response = await api.patch(`/api/admin/users/${userId}`, data);
  return response.data;
}

export async function createUser(data: {
  email: string;
  password: string;
}): Promise<AdminUser> {
  const response = await api.post('/api/admin/users', data);
  return response.data;
}

export async function deleteUser(userId: string): Promise<void> {
  await api.delete(`/api/admin/users/${userId}`);
}

export async function getAdminStats(): Promise<AdminStats> {
  const response = await api.get('/api/admin/stats');
  return response.data;
}
