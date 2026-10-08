import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { updateApplication } from '../lib/applications';
import type { Application, Round } from '../lib/types';
import ApplicationModal from './ApplicationModal';
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
      onChange={(event) => onChange(null, event.target.value)}
    />
  ),
}));

import HistoryViewer from './application/HistoryViewer';

vi.mock('../hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
function createApplication(rounds: Round[] = []): Application {
  return {
    status_meaning: 'applied',
    status_meaning_provenance: 'recorded',
    evidence_revision: 0,
    response_state: 'not_recorded',
    response_occurred_on: null,
    response_recorded_at: null,
    response_reference: null,
    id: 'app-1',
    company: 'Acme',
    job_title: 'Engineer',
    job_description: null,
    job_url: null,
    status: {
      id: 'status-1',
      name: 'Applied',
      color: 'aqua',
      meaning: 'applied',
    },
    cv_path: null,
    cover_letter_path: null,
    applied_at: '2026-03-25',
    created_at: '2026-03-25T00:00:00Z',
    updated_at: '2026-03-25T00:00:00Z',
    rounds,
    job_lead_id: null,
    location: null,
    salary_min: 85500,
    salary_max: null,
    salary_currency: null,
    recruiter_name: null,
    recruiter_title: null,
    recruiter_linkedin_url: null,
    requirements_must_have: [],
    requirements_nice_to_have: [],
    skills: [],
    years_experience_min: null,
    years_experience_max: null,
    source: null,
  };
}

const originalAdapter = api.defaults.adapter;
const nextStatus = {
  id: 'status-2',
  name: 'Interviewing',
  color: 'aqua',
  meaning: 'interviewing',
};
let application: Application;
let patches: Record<string, unknown>[];
let historyReads: number;
let rejectPatch: boolean;
beforeEach(() => {
  queryClient.clear();
  application = createApplication();
  patches = [];
  historyReads = 0;
  rejectPatch = false;
  api.defaults.adapter = async (config) => {
    let data: unknown;
    if (config.url === '/api/statuses') data = [application.status, nextStatus];
    else if (config.method === 'patch') {
      if (rejectPatch) throw new AxiosError('Rejected', undefined, config);
      const body = JSON.parse(config.data);
      patches.push(body);
      application = { ...application, ...body, status: nextStatus };
      data = application;
    } else if (config.url?.endsWith('/history')) {
      historyReads++;
      data = [
        {
          id: 'h-1',
          from_status: null,
          to_status: application.status,
          from_meaning: null,
          to_meaning: application.status.meaning,
          from_meaning_provenance: 'recorded',
          to_meaning_provenance: 'recorded',
          time_provenance: 'recorded',
          is_gap: false,
          corrected_at: null,
          correction_note: null,
          changed_at: '2026-01-01T00:00:00Z',
          note: null,
        },
      ];
    } else data = application;
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
});
afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  queryClient.clear();
});

it('saves 85,500 unchanged via the native number control and refreshes mounted history after the shared mutation', async () => {
  const onSuccess = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ApplicationModal
        isOpen
        application={application}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
      <HistoryViewer applicationId="app-1" />
    </QueryClientProvider>
  );
  await screen.findByText('Applied', { selector: 'span' });
  const salary = screen.getByLabelText('Min Salary') as HTMLInputElement;
  expect(salary.value).toBe('85500');
  expect(salary.checkValidity()).toBe(true);
  fireEvent.click(screen.getByRole('combobox', { name: /Status/ }));
  fireEvent.click(screen.getByRole('option', { name: 'Interviewing' }));
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Change status' })).getByRole(
      'button',
      { name: 'Save' }
    )
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Change status' })
    ).not.toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('app-1'));
  await waitFor(() =>
    expect(
      screen.getAllByText(/Interviewing/, { selector: 'span' })
    ).toHaveLength(2)
  );
  expect(patches[0]).toMatchObject({
    salary_min: 85500,
    salary_currency: null,
    status_id: 'status-2',
    applied_at: '2026-03-25',
  });
  expect(historyReads).toBe(2);
});

it('keeps the draft revision when newer application props arrive', async () => {
  const onSuccess = vi.fn();
  const props = { isOpen: true, application, onClose: vi.fn(), onSuccess };
  const view = render(<ApplicationModal {...props} />);
  await screen.findByRole('combobox', { name: /Status/ });
  fireEvent.change(screen.getByLabelText(/Company/), {
    target: { value: 'Draft company' },
  });
  view.rerender(
    <ApplicationModal
      {...props}
      application={{
        ...application,
        evidence_revision: 3,
        company: 'Newer company',
        response_state: 'recorded',
      }}
    />
  );
  expect(screen.getByLabelText(/Company/)).toHaveValue('Draft company');
  expect(
    screen.getByRole('checkbox', { name: 'Employer replied' })
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  expect(patches[0]).toMatchObject({
    expected_revision: 0,
    company: 'Draft company',
  });
});

it('saves incomplete preparation without an applied date and retains all record metadata', async () => {
  application = {
    ...application,
    company: '',
    job_title: '',
    applied_at: null,
    status: {
      id: 'preparing',
      name: 'Preparing',
      builtin_key: 'preparing',
      meaning: 'preparing',
      color: 'blue',
    },
    work_mode: 'remote',
    employment_type: 'contract',
    seniority: 'Junior',
    deadline: '2026-10-20',
    pay_period: 'month',
    priority: 'high',
    tags: ['python'],
  };
  const onSuccess = vi.fn();
  render(
    <ApplicationModal
      isOpen
      application={application}
      onClose={vi.fn()}
      onSuccess={onSuccess}
    />
  );
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: /Status/ })).toHaveTextContent(
      'Preparing'
    )
  );
  expect(screen.getByLabelText('Applied Date')).toHaveValue('');
  expect(screen.getByLabelText('Applied Date')).not.toBeRequired();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  expect(patches[0]).toMatchObject({
    company: null,
    job_title: null,
    applied_at: null,
    status_id: 'preparing',
    expected_revision: 0,
    work_mode: 'remote',
    employment_type: 'contract',
    seniority: 'Junior',
    deadline: '2026-10-20',
    pay_period: 'month',
    priority: 'high',
    tags: ['python'],
  });
});

it('prevents editing or closing the modal during a save', async () => {
  const adapter = api.defaults.adapter as import('axios').AxiosAdapter;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  api.defaults.adapter = async (config) => {
    if (config.method === 'patch') await pending;
    return adapter(config);
  };
  const onClose = vi.fn();
  render(
    <ApplicationModal
      isOpen
      application={application}
      onClose={onClose}
      onSuccess={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByLabelText(/Company/)).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Close modal' })).toBeDisabled();
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { cancelable: true })
  );
  expect(onClose).not.toHaveBeenCalled();
  release();
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

it('refreshes history even for a non-modal caller, and not for failed writes', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <HistoryViewer applicationId="app-1" />
    </QueryClientProvider>
  );
  await screen.findByText('Applied');
  rejectPatch = true;
  await expect(
    updateApplication('app-1', { status_id: 'status-2' })
  ).rejects.toThrow();
  expect(historyReads).toBe(1);
  rejectPatch = false;
  await updateApplication('app-1', { status_id: 'status-2' });
  await screen.findByText('Interviewing');
  expect(historyReads).toBe(2);
});

it('renders a content-free gap in both direct history consumers', async () => {
  api.defaults.adapter = async (config) => ({
    data: [
      {
        id: 'gap',
        from_status: null,
        to_status: null,
        is_gap: true,
        changed_at: '2026-01-01T00:00:00Z',
        note: null,
      },
    ],
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
  render(
    <QueryClientProvider client={queryClient}>
      <HistoryViewer applicationId="gap-app" />
    </QueryClientProvider>
  );
  await screen.findByText('History gap.');
  expect(screen.queryByText(/removed|deleted/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /View All/ }));
  expect(screen.getAllByText('History gap.')).toHaveLength(2);
});

it('preserves a shadowed current status ID while recording an optional undated response atomically', async () => {
  const current = { ...application.status, is_default: true };
  application.status = current;
  const adapter = api.defaults.adapter as import('axios').AxiosAdapter;
  api.defaults.adapter = async (config) =>
    config.url === '/api/statuses'
      ? {
          data: [
            {
              ...current,
              id: 'personal',
              meaning: 'rejected',
              is_default: false,
            },
          ],
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      : adapter(config);
  const onSuccess = vi.fn();
  render(
    <ApplicationModal
      isOpen
      application={application}
      onClose={vi.fn()}
      onSuccess={onSuccess}
    />
  );
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: /Status/ })).toHaveTextContent(
      'Applied (current)'
    )
  );
  fireEvent.click(screen.getByRole('combobox', { name: /Status/ }));
  expect(screen.getByRole('option', { name: 'Applied' })).toBeVisible();
  fireEvent.click(screen.getByRole('option', { name: 'Applied (current)' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Employer replied' }));
  fireEvent.change(screen.getByLabelText('Response note'), {
    target: { value: 'Employer outcome' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  expect(patches[0]).toMatchObject({
    status_id: current.id,
    expected_revision: 0,
    response_evidence: { occurred_on: null, reference: 'Employer outcome' },
  });
});

it('omits unchanged response evidence, but clears it only on explicit action', async () => {
  application.response_state = 'recorded';
  const onSuccess = vi.fn();
  const props = { isOpen: true, application, onClose: vi.fn(), onSuccess };
  const view = render(<ApplicationModal {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  expect(patches[0]).not.toHaveProperty('response_evidence');
  view.unmount();
  render(<ApplicationModal {...props} />);
  expect(
    screen.getByRole('checkbox', { name: 'Employer replied' })
  ).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Employer replied' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(2));
  expect(patches[1].response_evidence).toBeNull();
});
