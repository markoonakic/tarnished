import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import SettingsLayout from './SettingsLayout';

vi.mock('../Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('opens the default settings page when a mobile root becomes desktop-sized', () => {
  const media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('matchMedia', () => media);
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route path="theme" element={<p>Theme settings loaded</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  expect(screen.queryByText('Theme settings loaded')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Profile' })
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Language & time' })).toHaveLength(
    2
  );
  act(() => {
    media.matches = true;
    media.dispatchEvent(new Event('change'));
  });
  expect(screen.getByText('Theme settings loaded')).toBeVisible();
});

it('mounts only one security form and preserves its input on resize', () => {
  render(
    <MemoryRouter initialEntries={['/settings/security']}>
      <Routes>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route
            path="security"
            element={<input aria-label="Unsaved password" />}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  expect(screen.getAllByLabelText('Unsaved password')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Unsaved password'), {
    target: { value: 'unsaved' },
  });
  fireEvent(window, new Event('resize'));
  expect(screen.getByLabelText('Unsaved password')).toHaveValue('unsaved');
  expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute(
    'href',
    '/settings/security'
  );
});
