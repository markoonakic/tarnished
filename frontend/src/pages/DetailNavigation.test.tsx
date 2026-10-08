vi.mock('@/hooks/useEffectiveDayKey', () => ({
  useEffectiveDayKey: () => '2026-10-08',
}));
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ApplicationDetail from './ApplicationDetail';
import JobLeadDetail from './JobLeadDetail';

const { getApplication, getJobLead, toast } = vi.hoisted(() => ({
  getApplication: vi.fn(),
  getJobLead: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('../lib/applications', () => ({
  getApplication,
  deleteApplication: vi.fn(),
}));
vi.mock('../lib/jobLeads', () => ({ getJobLead, deleteJobLead: vi.fn() }));
vi.mock('../contexts/ToastContext', () => ({ useToastContext: () => toast }));
vi.mock('../hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
vi.mock('../components/slots/ApplicationReminders', () => ({
  default: () => null,
}));
vi.mock('../components/slots/LeadReminders', () => ({ default: () => null }));
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../components/DocumentSection', () => ({ default: () => null }));
vi.mock('../components/application/HistoryViewer', () => ({
  default: () => null,
}));
vi.mock('../components/ApplicationModal', () => ({ default: () => null }));
vi.mock('../components/ConvertToApplicationModal', () => ({
  default: () => null,
}));

function SwitchRecord({ prefix }: { prefix: string }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/${prefix}/new`)}>Next record</button>
  );
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it.each(['applications', 'job-leads'])(
  'does not display an old %s response after navigation',
  async (prefix) => {
    const read = prefix === 'applications' ? getApplication : getJobLead;
    const latest = {
      id: 'new',
      company: 'Current company',
      title: 'Engineer',
      job_title: 'Engineer',
      status:
        prefix === 'applications'
          ? { name: 'Applied', color: '#fff' }
          : 'pending',
      applied_at: '2026-10-01',
      updated_at: '2026-10-01T12:00:00Z',
      scraped_at: '2026-10-01T12:00:00Z',
      salary_min: null,
      salary_max: null,
      years_experience_min: null,
      years_experience_max: null,
      rounds: [],
    };
    let resolveOld!: (value: unknown) => void;
    read
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        })
      )
      .mockResolvedValueOnce(latest);
    render(
      <MemoryRouter initialEntries={[`/${prefix}/old`]}>
        <SwitchRecord prefix={prefix} />
        <Routes>
          <Route
            path={`/${prefix}/:id`}
            element={
              prefix === 'applications' ? (
                <ApplicationDetail />
              ) : (
                <JobLeadDetail />
              )
            }
          />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next record' }));
    await screen.findByRole('heading', { name: 'Current company' });
    await act(async () =>
      resolveOld({ ...latest, id: 'old', company: 'Old company' })
    );
    expect(
      screen.getByRole('heading', { name: 'Current company' })
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Old company' })
    ).not.toBeInTheDocument();
  }
);

it.each(['applications', 'job-leads'])(
  'clears the previous %s record when the next read fails',
  async (prefix) => {
    const read = prefix === 'applications' ? getApplication : getJobLead;
    read
      .mockResolvedValueOnce({
        id: 'old',
        company: 'Old company',
        title: 'Engineer',
        job_title: 'Engineer',
        status:
          prefix === 'applications'
            ? { name: 'Applied', color: '#fff' }
            : 'pending',
        applied_at: '2026-10-01',
        years_experience_min: null,
        years_experience_max: null,
        rounds: [],
      })
      .mockRejectedValueOnce(new Error('Offline'));
    render(
      <MemoryRouter initialEntries={[`/${prefix}/old`]}>
        <SwitchRecord prefix={prefix} />
        <Routes>
          <Route
            path={`/${prefix}/:id`}
            element={
              prefix === 'applications' ? (
                <ApplicationDetail />
              ) : (
                <JobLeadDetail />
              )
            }
          />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole('heading', { name: 'Old company' });
    fireEvent.click(screen.getByRole('button', { name: 'Next record' }));
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('heading', { name: 'Old company' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  }
);
