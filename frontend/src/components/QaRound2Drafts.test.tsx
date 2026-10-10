import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ApplicationModal from './ApplicationModal';
import JobLeadEditForm from './JobLeadEditForm';
import StatusChangeDialog from './StatusChangeDialog';
import { CompanyModal } from './companies/RecordModals';
import { apiV030, type Company } from '@/lib/apiV030';
import { createApplication } from '@/lib/applications';
import { updateJobLead } from '@/lib/jobLeads';
import type { JobLead } from '@/lib/types';

vi.mock('./CompanyPicker', () => ({
  default: ({
    id,
    name,
    onChange,
  }: {
    id?: string;
    name?: string;
    onChange: (id: null, name: string) => void;
  }) => (
    <input
      id={id}
      aria-label={id ? undefined : 'Company'}
      value={name ?? ''}
      onChange={(e) => onChange(null, e.target.value)}
    />
  ),
}));
vi.mock('@/lib/settings', () => ({
  listStatuses: async () => [
    { id: 'applied', name: 'Applied', meaning: 'applied' },
  ],
}));
vi.mock('@/lib/userPreferences', () => ({
  getPreferences: async () => ({ time_zone_mode: 'manual', time_zone: 'UTC' }),
}));
vi.mock('@/lib/applications', () => ({
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
}));
vi.mock('@/lib/jobLeads', async (original) => ({
  ...(await original<typeof import('@/lib/jobLeads')>()),
  updateJobLead: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function exitBlocked() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
it.each(['application', 'lead', 'status', 'company'])(
  'keeps the %s draft on Reload and a cancelled link before and during save',
  async (kind) => {
    const pending = () => new Promise<never>(() => {});
    vi.mocked(createApplication).mockImplementation(pending);
    vi.mocked(updateJobLead).mockImplementation(pending);
    vi.spyOn(apiV030, 'updateCompany').mockImplementation(pending);
    const statusSave = vi.fn(pending);
    const view =
      kind === 'application' ? (
        <ApplicationModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />
      ) : kind === 'lead' ? (
        <JobLeadEditForm
          lead={
            {
              id: 'lead',
              revision: 0,
              title: 'Original',
              requirements_must_have: [],
              requirements_nice_to_have: [],
              skills: [],
            } as unknown as JobLead
          }
          onSaved={vi.fn()}
          onCancel={vi.fn()}
          onReload={vi.fn()}
        />
      ) : kind === 'company' ? (
        <CompanyModal
          company={{ id: 'company', revision: 0, name: 'Company' } as Company}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      ) : (
        <StatusChangeDialog
          statusId="applied"
          options={[{ value: 'applied', label: 'Applied', meaning: 'applied' }]}
          onSave={statusSave}
          onClose={vi.fn()}
        />
      );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>{view}</MemoryRouter>
      </QueryClientProvider>
    );
    if (kind === 'application') {
      await waitFor(() =>
        expect(
          screen.getByRole('combobox', { name: /Status/ })
        ).toHaveTextContent('Applied')
      );
      fireEvent.change(screen.getByLabelText(/Company/), {
        target: { value: 'Company' },
      });
    }
    const field =
      kind === 'application'
        ? screen.getByLabelText(/Job Title/)
        : kind === 'lead'
          ? screen.getByLabelText('Title')
          : kind === 'company'
            ? screen.getByLabelText('Industry')
            : screen.getByLabelText('Comment (optional)');
    fireEvent.change(field, { target: { value: 'Keep this draft' } });
    expect(exitBlocked()).toBe(true);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const anchor = document.createElement('a');
    anchor.href = '/analytics';
    document.body.append(anchor);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(click);
    anchor.remove();
    expect(click.defaultPrevented).toBe(true);
    expect(field).toHaveValue('Keep this draft');
    fireEvent.submit(field.closest('form')!);
    await waitFor(() =>
      expect(
        kind === 'application'
          ? createApplication
          : kind === 'lead'
            ? updateJobLead
            : kind === 'company'
              ? apiV030.updateCompany
              : statusSave
      ).toHaveBeenCalledOnce()
    );
    expect(exitBlocked()).toBe(true);
    expect(field).toHaveValue('Keep this draft');
  }
);
it('reuses an application create key after a lost response and keeps corrected inputs', async () => {
  vi.mocked(createApplication).mockRejectedValue(new Error('Response lost'));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ApplicationModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: /Status/ })).toHaveTextContent(
      'Applied'
    )
  );
  fireEvent.change(screen.getByLabelText(/Company/), {
    target: { value: 'Company' },
  });
  const field = screen.getByLabelText(/Job Title/);
  fireEvent.change(field, { target: { value: 'Original draft' } });
  fireEvent.submit(field.closest('form')!);
  await screen.findByText('Response lost');
  fireEvent.change(field, { target: { value: 'Corrected draft' } });
  fireEvent.submit(field.closest('form')!);
  await waitFor(() => expect(createApplication).toHaveBeenCalledTimes(2));
  const [first, retry] = vi.mocked(createApplication).mock.calls;
  expect(first[1]).toBeTruthy();
  expect(retry[1]).toBe(first[1]);
  expect(retry[0].job_title).toBe('Corrected draft');
  expect(field).toHaveValue('Corrected draft');
});
