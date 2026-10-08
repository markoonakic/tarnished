import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ApplicationDetail from './ApplicationDetail';
import { getApplication, updateApplication } from '@/lib/applications';
import { apiV030 } from '@/lib/apiV030';
import type { Application, Status } from '@/lib/types';
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('@/lib/applications', () => ({
  getApplication: vi.fn(),
  updateApplication: vi.fn(),
  deleteApplication: vi.fn(),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToastContext: () => toast }));
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/DocumentSection', () => ({ default: () => null }));
vi.mock('@/components/slots/ApplicationReminders', () => ({
  default: () => null,
}));
vi.mock('@/hooks/useEffectiveDayKey', () => ({
  useEffectiveDayKey: () => '2026-10-08',
}));
vi.mock('@/components/application/HistoryViewer', () => ({
  default: () => null,
}));
vi.mock('@/components/ApplicationModal', () => ({ default: () => null }));
vi.mock('@/lib/settings', () => ({ listStatuses: async () => statuses }));
vi.mock('@/lib/userPreferences', () => ({
  getPreferences: async () => ({
    time_zone_mode: 'manual',
    time_zone: 'Europe/Belgrade',
  }),
}));
const statuses = [
  {
    id: 'applied',
    name: 'Applied',
    builtin_key: 'applied',
    meaning: 'applied',
    color: 'aqua',
  },
  {
    id: 'rejected',
    name: 'Rejected',
    builtin_key: 'rejected',
    meaning: 'rejected',
    color: 'red',
  },
] as Status[];
let application: Application;
beforeEach(() => {
  application = {
    id: 'app-1',
    company: 'Orbis Ledger',
    job_title: 'Engineer',
    status: statuses[0],
    evidence_revision: 4,
    rounds: [],
    applied_at: '2026-10-01',
    updated_at: '2026-10-08T09:00:00Z',
    requirements_must_have: [],
    requirements_nice_to_have: [],
    skills: [],
    years_experience_min: null,
    years_experience_max: null,
    archived_at: null,
  } as unknown as Application;
  vi.mocked(getApplication).mockImplementation(async () => application);
  vi.mocked(updateApplication).mockImplementation(async (_id, data) => {
    application = {
      ...application,
      status:
        statuses.find((status) => status.id === data.status_id) ||
        application.status,
      outcome_reason: data.status_reason,
      evidence_revision: 5,
    };
    return application;
  });
  vi.spyOn(apiV030, 'updateApplication').mockImplementation(
    async (_id, data) => {
      application = {
        ...application,
        archived_at: data.archived ? '2026-10-08T09:00:00Z' : null,
        evidence_revision: application.evidence_revision + 1,
      };
      return application as unknown as Awaited<
        ReturnType<typeof apiV030.updateApplication>
      >;
    }
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function mount() {
  render(
    <MemoryRouter initialEntries={['/applications/app-1']}>
      <Routes>
        <Route path="/applications/:id" element={<ApplicationDetail />} />
      </Routes>
    </MemoryRouter>
  );
  return screen.findByRole('heading', { name: 'Orbis Ledger' });
}
it('archives only after confirmation, shows the banner and restores the record', async () => {
  await mount();
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  expect(apiV030.updateApplication).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  const unarchive = await screen.findByRole('button', { name: 'Unarchive' });
  expect(apiV030.updateApplication).toHaveBeenCalledWith('app-1', {
    archived: true,
    expected_revision: 4,
  });
  expect(screen.getByText('Archived')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Archive' })
  ).not.toBeInTheDocument();
  fireEvent.click(unarchive);
  await screen.findByRole('button', { name: 'Archive' });
  expect(apiV030.updateApplication).toHaveBeenLastCalledWith('app-1', {
    archived: false,
    expected_revision: 5,
  });
});
it('uses the status dialog and saves time, comment and rejection reason atomically', async () => {
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Change status' }));
  const dialog = await screen.findByRole('dialog', { name: 'Change status' });
  fireEvent.click(within(dialog).getByRole('combobox', { name: 'New status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Rejected' }));
  fireEvent.change(within(dialog).getByLabelText('Date & time'), {
    target: { value: '2026-10-08T10:00' },
  });
  fireEvent.change(within(dialog).getByLabelText('Comment (optional)'), {
    target: { value: 'Recruiter sent a reply.' },
  });
  fireEvent.change(within(dialog).getByLabelText('Reason'), {
    target: { value: 'Position filled' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(updateApplication).toHaveBeenCalledWith('app-1', {
      expected_revision: 4,
      status_id: 'rejected',
      status_changed_at: '2026-10-08T08:00:00.000Z',
      status_comment: 'Recruiter sent a reply.',
      status_reason: 'Position filled',
    })
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  );
  expect(screen.getByText('Position filled')).toBeVisible();
});
it('does not change the record if a status save fails', async () => {
  vi.mocked(updateApplication).mockRejectedValue(new Error('Conflict'));
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Change status' }));
  const dialog = await screen.findByRole('dialog', { name: 'Change status' });
  fireEvent.change(within(dialog).getByLabelText('Comment (optional)'), {
    target: { value: 'Keep this draft' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByRole('alert');
  expect(within(dialog).getByLabelText('Comment (optional)')).toHaveValue(
    'Keep this draft'
  );
  expect(dialog).toBeVisible();
});
