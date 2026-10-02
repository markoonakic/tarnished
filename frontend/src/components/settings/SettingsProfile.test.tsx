import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SettingsProfile from './SettingsProfile';
import { getProfile } from '../../lib/profile';

vi.mock('../../lib/profile', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('@/hooks/useToast', () => {
  const toast = { error: vi.fn(), success: vi.fn() };
  return { useToast: () => toast };
});
vi.mock('./SettingsLayout', () => ({ SettingsBackLink: () => null }));
afterEach(cleanup);

it('does not show a blank editable profile after a failed read and allows retry', async () => {
  vi.mocked(getProfile)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce({
      id: 'profile-1',
      first_name: 'Mark',
      last_name: null,
      email: null,
      phone: null,
      location: null,
      linkedin_url: null,
      city: null,
      country: null,
      authorized_to_work: null,
      requires_sponsorship: null,
    });
  render(<SettingsProfile />);
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('First Name')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Save' })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByLabelText('First Name')).toHaveValue('Mark');
});
