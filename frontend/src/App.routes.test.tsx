import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { Outlet } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
const auth = vi.hoisted(() => ({
  user: { id: 'user', email: 'user@example.com', is_admin: false },
  loading: false,
}));
vi.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => auth,
}));
vi.mock('./contexts/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./components/LanguagePreference', () => ({ default: () => null }));
vi.mock('./components/ToastContainer', () => ({ default: () => null }));
vi.mock('./components/settings/SettingsLayout', () => ({
  default: () => <Outlet />,
}));
vi.mock('./pages/Profile', () => ({ default: () => <p>Profile page</p> }));
vi.mock('./pages/Companies', () => ({ default: () => <p>Companies page</p> }));
vi.mock('./pages/CompanyDetail', () => ({
  default: () => <p>Company detail page</p>,
}));
vi.mock('./pages/ContactDetail', () => ({
  default: () => <p>Contact detail page</p>,
}));
vi.mock('./pages/Tasks', () => ({ default: () => <p>Tasks page</p> }));
vi.mock('./pages/InterviewDetail', () => ({
  default: () => <p>Interview detail page</p>,
}));
beforeEach(() => {
  window.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});
it.each([
  ['/profile', 'Profile page'],
  ['/settings/profile', 'Profile page'],
  ['/companies', 'Companies page'],
  ['/contacts', 'Companies page'],
  ['/companies/one', 'Company detail page'],
  ['/contacts/one', 'Contact detail page'],
  ['/tasks', 'Tasks page'],
  ['/interviews/one', 'Interview detail page'],
])('registers %s as a protected feature page', async (path, label) => {
  window.history.replaceState({}, '', path);
  render(<App />);
  expect(await screen.findByText(label)).toBeInTheDocument();
});
