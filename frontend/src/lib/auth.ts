import api from './api';

interface LoginData {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
}

export async function login(data: LoginData) {
  const response = await api.post('/api/auth/login', data);
  localStorage.setItem('access_token', response.data.access_token);
  localStorage.setItem('refresh_token', response.data.refresh_token);
  return response.data;
}

export async function register(data: RegisterData, needsSetup = false) {
  const params = needsSetup ? '?needs_setup=true' : '';
  const response = await api.post(`/api/auth/register${params}`, data);
  return response.data;
}

export function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  window.location.href = '/login';
}

export function isAuthenticated() {
  return !!localStorage.getItem('access_token');
}
