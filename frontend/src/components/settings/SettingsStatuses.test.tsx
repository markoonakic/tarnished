import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SettingsStatuses from './SettingsStatuses';
import i18n from '@/lib/i18n';
import { createStatus, updateStatus } from '@/lib/settings';
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
vi.mock('@/lib/settings', () => ({
  listStatuses: vi.fn().mockResolvedValue([
    {
      id: 'personal',
      name: 'Custom',
      meaning: 'rejected',
      color: '#ffffff',
      is_default: false,
    },
  ]),
  createStatus: vi.fn().mockResolvedValue({}),
  updateStatus: vi.fn().mockResolvedValue({}),
  deleteStatus: vi.fn(),
}));
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});
beforeEach(() => vi.clearAllMocks());
it('sends one create while Add is pending, including repeated form submissions', async () => {
  vi.mocked(createStatus).mockImplementationOnce(() => new Promise(() => {}));
  render(
    <MemoryRouter>
      <SettingsStatuses />
    </MemoryRouter>
  );
  await screen.findByText('Custom');
  fireEvent.change(screen.getByPlaceholderText('New status name'), {
    target: { value: 'One create' },
  });
  const add = screen.getByRole('button', { name: 'Add' });
  fireEvent.submit(add.closest('form')!);
  fireEvent.submit(add.closest('form')!);
  expect(createStatus).toHaveBeenCalledOnce();
  expect(add).toBeDisabled();
});
it('keeps a stale edit and shows the conflict rather than hiding the editor', async () => {
  vi.mocked(updateStatus).mockRejectedValueOnce({
    isAxiosError: true,
    response: { status: 409 },
  });
  render(
    <MemoryRouter>
      <SettingsStatuses />
    </MemoryRouter>
  );
  await screen.findByText('Custom');
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByPlaceholderText('Status name'), {
    target: { value: 'Retained draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(
    'Settings changed. Reload and review before retrying.'
  );
  expect(screen.getByPlaceholderText('Status name')).toHaveValue(
    'Retained draft'
  );
});
it('keeps the stage explanation inside a closed HelpTip', async () => {
  render(
    <MemoryRouter>
      <SettingsStatuses />
    </MemoryRouter>
  );
  await screen.findByText('Custom');
  expect(
    screen.queryByText(/Choose the stage used in reports/)
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'About application statuses' })
  );
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Choose the stage used in reports'
  );
});
it('translates stage options on language changes without translating custom names', async () => {
  await i18n.changeLanguage('sr-Latn');
  render(
    <MemoryRouter>
      <SettingsStatuses />
    </MemoryRouter>
  );
  await screen.findByText('Custom');
  expect(screen.getByText('Faza: Odbijena')).toBeVisible();
  fireEvent.click(screen.getByRole('combobox', { name: 'Faza' }));
  expect(screen.getByRole('option', { name: 'Ponuda' })).toBeVisible();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  expect(screen.getByRole('option', { name: 'Offer' })).toBeVisible();
  expect(screen.getByText('Custom')).toBeVisible();
});
it('exposes stable meaning and sends explicitly selected semantics for a custom label', async () => {
  render(
    <MemoryRouter>
      <SettingsStatuses />
    </MemoryRouter>
  );
  await screen.findByText('Custom');
  expect(screen.getByText('Stage: Rejected')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add' })).toHaveClass('h-10');
  expect(screen.getByPlaceholderText('New status name')).toHaveClass('h-10');
  expect(
    screen.getByPlaceholderText('New status name').closest('form')
  ).toHaveClass('items-end');
  fireEvent.change(screen.getByPlaceholderText('New status name'), {
    target: { value: 'Different label' },
  });
  fireEvent.click(screen.getByRole('combobox', { name: 'Stage' }));
  fireEvent.click(screen.getByRole('option', { name: 'Offer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(createStatus).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Different label', meaning: 'offer' })
    )
  );
});
it('a label-only rename preserves the selected definition meaning rather than inferring it from text', async () => {
  render(
    <MemoryRouter>
      <SettingsStatuses />
    </MemoryRouter>
  );
  await screen.findByText('Custom');
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('h-10');
  expect(screen.getByPlaceholderText('Status name').parentElement).toHaveClass(
    'items-end'
  );
  fireEvent.change(screen.getByPlaceholderText('Status name'), {
    target: { value: 'Offer' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(updateStatus).toHaveBeenCalledWith('personal', {
      expected_name: 'Custom',
      expected_color: '#ffffff',
      expected_meaning: 'rejected',
      name: 'Offer',
      meaning: 'rejected',
      color: '#ffffff',
    })
  );
});
