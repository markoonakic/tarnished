import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../lib/api';
import {
  convertToApplication,
  extractJobLead,
  retryJobLead,
} from '../lib/jobLeads';
import type { JobLead } from '../lib/types';
import JobLeadCaptureForm from './JobLeadCaptureForm';
import JobLeadEditForm from './JobLeadEditForm';
import JobLeadDetail from '../pages/JobLeadDetail';
import JobLeads from '../pages/JobLeads';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('../contexts/ToastContext', () => ({ useToastContext: () => toast }));
vi.mock('../hooks/useToast', () => ({ useToast: () => toast }));
vi.mock('./Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

function lead(): JobLead {
  return {
    id: 'saved-id',
    url: 'https://synthetic.test/job',
    status: 'pending',
    revision: 0,
    source_text: '<img src=x onerror=alert(1)> untrusted',
    source_truncated: true,
    content_warning: 'Source text was truncated.',
    processing_started_at: null,
    manual_fields: [],
    company: null,
    title: null,
    description: null,
    location: null,
    salary_min: null,
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
    posted_date: null,
    scraped_at: '2026-04-14T10:00:00Z',
    converted_to_application_id: null,
    error_message: null,
  };
}
function reject(
  config: InternalAxiosRequestConfig,
  status: number,
  detail: unknown
): never {
  throw new AxiosError('Request failed', undefined, config, undefined, {
    data: { detail },
    status,
    statusText: 'Error',
    headers: {},
    config,
  });
}
const original = api.defaults.adapter;
let saved: JobLead;
let requests: {
  method?: string;
  url?: string;
  body: Record<string, unknown>;
}[];
let failure: 'none' | 'duplicate' | 'extract' | 'conflict' | 'reload' = 'none';
beforeEach(() => {
  saved = lead();
  requests = [];
  failure = 'none';
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.defaults.adapter = async (config) => {
    const body = config.data ? JSON.parse(config.data) : {};
    requests.push({ method: config.method, url: config.url, body });
    if (config.method === 'get' && failure === 'reload')
      reject(config, 503, 'Read unavailable');
    if (config.method === 'post' && config.url === '/api/job-leads') {
      if (failure === 'duplicate')
        reject(config, 409, {
          id: saved.id,
          message: 'This job has already been saved',
        });
    } else if (config.method === 'patch') {
      if (failure === 'conflict')
        reject(config, 409, { id: saved.id, message: 'Job lead changed' });
      saved = { ...saved, ...body, revision: saved.revision + 1 };
    } else if (
      config.url?.endsWith('/extract') ||
      config.url?.endsWith('/retry')
    ) {
      if (failure === 'extract' || failure === 'reload') {
        saved = {
          ...saved,
          status: 'failed',
          revision: saved.revision + 2,
          error_message:
            'Extraction failed; saved source and manual edits are retained.',
        };
        reject(config, 502, {
          id: saved.id,
          message: 'AI service unavailable',
        });
      }
      saved = { ...saved, status: 'extracted', revision: saved.revision + 2 };
    } else if (config.url?.endsWith('/convert')) {
      saved = {
        ...saved,
        status: 'converted',
        converted_to_application_id: 'application-id',
      };
      return {
        data: { id: 'application-id', job_lead_id: saved.id },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    }
    return { data: saved, status: 200, statusText: 'OK', headers: {}, config };
  };
});
afterEach(() => {
  cleanup();
  api.defaults.adapter = original;
  vi.restoreAllMocks();
});
function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/job-leads/saved-id']}>
      <Routes>
        <Route path="/job-leads/:id" element={<JobLeadDetail />} />
        <Route
          path="/applications/:id"
          element={<p>Application destination</p>}
        />
      </Routes>
    </MemoryRouter>
  );
}

it('shows stored zero salary bounds instead of treating them as missing', async () => {
  saved = {
    ...saved,
    company: 'Unpaid placement',
    title: 'Trainee',
    salary_min: 0,
    salary_max: 0,
    salary_currency: 'EUR',
  };
  renderDetail();
  await screen.findByRole('heading', { name: 'Unpaid placement' });
  expect(screen.getByRole('heading', { name: 'Salary Range' })).toBeVisible();
  expect(screen.getByText('EUR 0 - 0')).toBeVisible();
  expect(requests.every((r) => r.method === 'get')).toBe(true);
});

it('shows a posted calendar date without inventing a time or shifting its day', async () => {
  saved = {
    ...saved,
    company: 'Calendar posting',
    title: 'Engineer',
    posted_date: '2026-09-15',
  };
  renderDetail();
  await screen.findByRole('heading', { name: 'Calendar posting' });
  expect(screen.getByText('Posted:').parentElement).toHaveTextContent(
    '9/15/2026'
  );
  expect(screen.getByText('Posted:').parentElement).not.toHaveTextContent(
    /AM|PM/
  );
});

it('saves without AI and shows persisted identity/warning before optional navigation', async () => {
  render(
    <MemoryRouter>
      <JobLeadCaptureForm />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'New Job Lead' }));
  fireEvent.change(screen.getByLabelText(/Job URL/), {
    target: { value: saved.url },
  });
  fireEvent.change(screen.getByLabelText(/Job description/), {
    target: { value: '<script>untrusted</script>' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Lead' }));
  expect(
    await screen.findByRole('link', { name: 'Open saved lead' })
  ).toHaveAttribute('href', '/job-leads/saved-id');
  expect(screen.getByRole('status')).toHaveTextContent(
    'Source text was truncated.'
  );
  expect(requests).toEqual([
    {
      method: 'post',
      url: '/api/job-leads',
      body: { url: saved.url, text: '<script>untrusted</script>' },
    },
  ]);
  expect(
    screen.queryByRole('button', { name: 'Save Lead' })
  ).not.toBeInTheDocument();
});

it('does not claim the list is empty when its actual post-save transport refresh fails', async () => {
  let created = false;
  api.defaults.adapter = async (config) => {
    if (config.method === 'post') created = true;
    else if (created && config.url === '/api/job-leads')
      reject(config, 503, 'List unavailable');
    const data =
      config.method === 'post'
        ? saved
        : config.url?.endsWith('/sources')
          ? { sources: [] }
          : { items: [], total: 0 };
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  render(
    <MemoryRouter>
      <JobLeads />
    </MemoryRouter>
  );
  await screen.findByText(
    'No job leads yet. Add URLs to start tracking job opportunities.'
  );
  fireEvent.click(screen.getByRole('button', { name: 'New Job Lead' }));
  fireEvent.change(screen.getByLabelText(/Job URL/), {
    target: { value: saved.url },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Lead' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not refresh the list'
  );
  expect(screen.getByRole('link', { name: 'Open saved lead' })).toHaveAttribute(
    'href',
    '/job-leads/saved-id'
  );
  expect(
    screen.queryByText(
      'No job leads yet. Add URLs to start tracking job opportunities.'
    )
  ).not.toBeInTheDocument();
});

it('keeps the saved identity through a rejected post-save list refresh', async () => {
  const onSaved = vi.fn().mockRejectedValue(new Error('List unavailable'));
  render(
    <MemoryRouter>
      <JobLeadCaptureForm onSaved={onSaved} />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'New Job Lead' }));
  fireEvent.change(screen.getByLabelText(/Job URL/), {
    target: { value: saved.url },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Lead' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Lead saved, but the list could not be refreshed'
  );
  expect(screen.getByRole('link', { name: 'Open saved lead' })).toHaveAttribute(
    'href',
    '/job-leads/saved-id'
  );
  expect(onSaved).toHaveBeenCalledOnce();
  expect(requests).toHaveLength(1);
  expect(
    screen.queryByRole('button', { name: 'Save Lead' })
  ).not.toBeInTheDocument();
});

it('validates source by Unicode characters without silently clipping the input', async () => {
  render(
    <MemoryRouter>
      <JobLeadCaptureForm />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'New Job Lead' }));
  fireEvent.change(screen.getByLabelText(/Job URL/), {
    target: { value: saved.url },
  });
  const source = screen.getByLabelText(/Job description/);
  fireEvent.change(source, { target: { value: '😀'.repeat(100001) } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Lead' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Shorten the input'
  );
  expect(requests).toHaveLength(0);
  expect(source).toHaveValue('😀'.repeat(100001));
  fireEvent.change(source, { target: { value: '😀'.repeat(100000) } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Lead' }));
  await screen.findByRole('link', { name: 'Open saved lead' });
  expect(requests[0].body.text).toBe('😀'.repeat(100000));
});

it('exposes owner-scoped duplicate identity instead of retrying save', async () => {
  failure = 'duplicate';
  render(
    <MemoryRouter>
      <JobLeadCaptureForm />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'New Job Lead' }));
  fireEvent.change(screen.getByLabelText(/Job URL/), {
    target: { value: saved.url },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Lead' }));
  expect(
    await screen.findByRole('link', { name: 'Open saved lead' })
  ).toHaveAttribute('href', '/job-leads/saved-id');
  expect(screen.getByRole('alert')).toHaveTextContent('already been saved');
  expect(requests).toHaveLength(1);
});

it('closes an unchanged edit without sending a mutation', () => {
  const onCancel = vi.fn();
  render(
    <JobLeadEditForm
      lead={saved}
      onSaved={vi.fn()}
      onCancel={onCancel}
      onReload={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(requests).toHaveLength(0);
});

it('edits incomplete fields using only changed values, null and [] with the frozen revision', async () => {
  saved.location = 'Old';
  saved.skills = ['Old'];
  saved.salary_min = 85500;
  const onSaved = vi.fn();
  render(
    <JobLeadEditForm
      lead={saved}
      onSaved={onSaved}
      onCancel={vi.fn()}
      onReload={vi.fn()}
    />
  );
  fireEvent.change(screen.getByLabelText(/^Company/), {
    target: { value: 'Manual company' },
  });
  fireEvent.change(screen.getByLabelText(/^Title/), {
    target: { value: 'Manual title' },
  });
  fireEvent.change(screen.getByLabelText(/^Location/), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByLabelText(/^Skills/), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(requests[0]).toEqual({
    method: 'patch',
    url: '/api/job-leads/saved-id',
    body: {
      expected_revision: 0,
      company: 'Manual company',
      title: 'Manual title',
      location: null,
      skills: [],
    },
  });
});

it('rejects oversized edit fields and lists without sending or truncating corrections', async () => {
  render(
    <JobLeadEditForm
      lead={saved}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
      onReload={vi.fn()}
    />
  );
  fireEvent.change(screen.getByLabelText(/^Company/), {
    target: { value: '😀'.repeat(256) },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('255 characters');
  fireEvent.change(screen.getByLabelText(/^Company/), {
    target: { value: 'Manual' },
  });
  fireEvent.change(screen.getByLabelText(/^Skills/), {
    target: { value: 'x\n'.repeat(201) },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('200 entries');
  expect(requests).toHaveLength(0);
});

it('retains a conflicting draft without silent rebase or mutation replay', async () => {
  failure = 'conflict';
  const onReload = vi.fn();
  render(
    <JobLeadEditForm
      lead={saved}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
      onReload={onReload}
    />
  );
  fireEvent.change(screen.getByLabelText(/^Company/), {
    target: { value: 'My correction' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('draft is stale');
  expect(screen.getByLabelText(/^Company/)).toHaveValue('My correction');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Discard draft and reload saved lead' })
  );
  expect(onReload).toHaveBeenCalledOnce();
  expect(requests).toHaveLength(1);
});

it('renders source escaped and permits manual-ready conversion from saved/not-extracted', async () => {
  saved.company = 'Manual company';
  saved.title = 'Manual title';
  const { container } = renderDetail();
  await screen.findByText('Saved', { selector: 'span' });
  expect(container.querySelector('pre')).toHaveTextContent(
    '<img src=x onerror=alert(1)> untrusted'
  );
  expect(container.querySelector('pre img')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Convert to Application' })
  );
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Your saved job details will be copied');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Convert to Application' })
  );
  await screen.findByText('Application destination');
  expect(requests.map((request) => request.url)).toEqual([
    '/api/job-leads/saved-id',
    '/api/job-leads/saved-id/convert',
  ]);
});

it('keeps saved identity and reads the new revision after provider failure, without automatic retry', async () => {
  renderDetail();
  await screen.findByText('Saved', { selector: 'span' });
  failure = 'extract';
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your job lead is saved. AI service unavailable'
  );
  await screen.findByText('Failed', { selector: 'span' });
  expect(screen.queryByText(/Saved lead:|Revision 2/)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry Extraction' })
  ).toBeEnabled();
  expect(requests.map((request) => request.method)).toEqual([
    'get',
    'post',
    'get',
  ]);
  expect(requests[1].body).toEqual({
    expected_revision: 0,
    restart_processing: false,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry Extraction' }));
  await waitFor(() =>
    expect(requests.filter((r) => r.method === 'post')).toHaveLength(2)
  );
  expect(
    requests.filter((r) => r.method === 'post')[1].body.expected_revision
  ).toBe(2);
});

it('marks failed refresh stale and preserves the saved identity instead of losing the lead', async () => {
  renderDetail();
  await screen.findByText('Saved', { selector: 'span' });
  failure = 'reload';
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
  );
  expect(
    screen.getByRole('heading', { name: 'Unknown Company' })
  ).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('Your job lead is saved');
  expect(
    screen.getByRole('button', { name: 'Reload saved lead' })
  ).toBeEnabled();
});

it('distinguishes a requested retry from the last saved failure until the response arrives', async () => {
  saved.status = 'failed';
  saved.error_message = 'Previous failure';
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  api.defaults.adapter = async (config) => {
    if (config.method === 'post') {
      await waiting;
      saved = { ...saved, status: 'extracted', error_message: null };
    }
    return { data: saved, status: 200, statusText: 'OK', headers: {}, config };
  };
  renderDetail();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry Extraction' })
  );
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Filling in job details'
  );
  expect(screen.getByText('Last saved status: Failed')).toBeInTheDocument();
  expect(screen.getByText('Previous extraction error')).toBeInTheDocument();
  finish();
  await screen.findByText('Extracted', { selector: 'span' });
});

it('shows uncertain processing and sends acknowledged revisioned restart only after confirmation', async () => {
  saved.status = 'processing';
  saved.revision = 3;
  renderDetail();
  await screen.findByText('Processing', { selector: 'span' });
  expect(screen.getByRole('status')).toHaveTextContent(
    'Extraction has not finished'
  );
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(
    screen.getByRole('button', { name: 'Restart interrupted extraction' })
  );
  expect(requests).toHaveLength(1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Restart interrupted extraction' })
  );
  await screen.findByText('Extracted', { selector: 'span' });
  expect(requests[1]).toEqual({
    method: 'post',
    url: '/api/job-leads/saved-id/retry',
    body: { expected_revision: 3, restart_processing: true },
  });
});

it('sends explicit extract/retry bodies and retains S05 conversion timezone transport', async () => {
  await extractJobLead(saved.id, { expected_revision: 0 });
  await retryJobLead(saved.id, {
    expected_revision: 2,
    restart_processing: true,
  });
  let timezone: unknown;
  api.defaults.adapter = async (config) => {
    timezone = config.headers.get('Time-Zone');
    return {
      data: { id: 'application-id' },
      status: 201,
      statusText: 'Created',
      headers: {},
      config,
    };
  };
  await convertToApplication(saved.id);
  expect(requests.map((request) => request.body)).toEqual([
    { expected_revision: 0 },
    { expected_revision: 2, restart_processing: true },
  ]);
  expect(timezone).toBeTruthy();
});

it('native form submission preserves an unchanged scheme-less recruiter link in changed-only edits', async () => {
  saved.recruiter_linkedin_url = 'linkedin.com/in/synthetic';
  const onSaved = vi.fn();
  const { container } = render(
    <JobLeadEditForm
      lead={saved}
      onSaved={onSaved}
      onCancel={vi.fn()}
      onReload={vi.fn()}
    />
  );
  const recruiter = screen.getByLabelText(/Recruiter LinkedIn URL/);
  expect(recruiter).toHaveAttribute('inputmode', 'url');
  fireEvent.change(screen.getByLabelText(/^Company/), {
    target: { value: 'Unrelated correction' },
  });
  expect(container.querySelector('form')!.checkValidity()).toBe(true);
  // click invokes native form validation/submission; fireEvent.submit would bypass the regression.
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(requests).toEqual([
    {
      method: 'patch',
      url: '/api/job-leads/saved-id',
      body: { expected_revision: 0, company: 'Unrelated correction' },
    },
  ]);
  expect(saved.recruiter_linkedin_url).toBe('linkedin.com/in/synthetic');
});
