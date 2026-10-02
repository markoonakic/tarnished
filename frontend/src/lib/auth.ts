import api, { clearAuthTokens, isAuthenticated, setAuthTokens } from './api';

interface LoginData {
  email: string;
  password: string;
}

export async function login(data: LoginData) {
  const response = await api.post('/api/auth/login', data);
  setAuthTokens(response.data.access_token, response.data.refresh_token);
  return response.data;
}

export function logout() {
  clearAuthTokens();
  window.location.href = '/login';
}

export { isAuthenticated };
