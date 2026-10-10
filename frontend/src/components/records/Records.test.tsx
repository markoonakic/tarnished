vi.mock('@/hooks/useEffectiveDayKey', () => ({
  useEffectiveDayKey: () => '2026-10-08',
}));
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiV030, type Company, type Attachment } from '@/lib/apiV030';
import { createJobLead } from '@/lib/jobLeads';
import type { Application, JobLead } from '@/lib/types';
import JobLeadCaptureForm from '../JobLeadCaptureForm';
import LeadDecision from '../slots/LeadDecision';
import ApplicationOtherFiles from '../slots/ApplicationOtherFiles';
import SavedPosting from './SavedPosting';
import RecordTags from './RecordTags';
import RecordDetails from './RecordDetails';
import DeadlineReminder from './DeadlineReminder';
import { jobMetadata } from '@/lib/records';
import i18n from '@/lib/i18n';

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }));
vi.mock('@/lib/jobLeads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/jobLeads')>()),
  createJobLead: vi.fn(),
}));
const company = {
  id: 'company-1',
  name: 'Orbis Ledger',
  revision: 0,
} as Company;
const lead = {
  id: 'lead-1',
  company: 'Orbis Ledger',
  title: 'Engineer',
  decision: null,
  revision: 4,
  priority: 'normal',
  tags: [],
} as unknown as JobLead;
const application = { id: 'app-1', evidence_revision: 3 } as Application;
const attachment = {
  id: 'file-1',
  kind: 'task',
  original_filename: 'exercise.txt',
  byte_count: 2048,
  uploaded_at: '2026-10-08T09:00:00Z',
} as Attachment;
beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.spyOn(apiV030, 'companies').mockResolvedValue({
    items: [company],
    total: 1,
    page: 1,
    per_page: 100,
  });
  vi.spyOn(apiV030, 'createCompany').mockResolvedValue(company);
  vi.spyOn(apiV030, 'updateLead').mockResolvedValue({
    ...lead,
    decision: 'interesting',
  } as unknown as Awaited<ReturnType<typeof apiV030.updateLead>>);
  vi.spyOn(apiV030, 'updateApplication').mockResolvedValue({
    id: 'app-1',
  } as Awaited<ReturnType<typeof apiV030.updateApplication>>);
  vi.spyOn(apiV030, 'replaceLeadSource').mockResolvedValue({
    id: 'lead-1',
  } as Awaited<ReturnType<typeof apiV030.replaceLeadSource>>);
  vi.spyOn(apiV030, 'replaceApplicationSource').mockResolvedValue({
    id: 'app-1',
  } as Awaited<ReturnType<typeof apiV030.replaceApplicationSource>>);
  vi.spyOn(apiV030, 'fetchLeadSource').mockResolvedValue({
    text: 'Fetched text',
    url: 'https://example.org/job',
    truncated: false,
    warning: null,
  });
  vi.spyOn(apiV030, 'attachments').mockResolvedValue([attachment]);
  vi.spyOn(apiV030, 'uploadAttachment').mockResolvedValue(attachment);
  vi.spyOn(apiV030, 'deleteAttachment').mockResolvedValue();
  vi.spyOn(apiV030, 'reminders').mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    per_page: 25,
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(createJobLead).mockResolvedValue(lead);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it('shows readable overdue deadlines relative to the account day', () => {
  render(
    <RecordDetails
      record={{ id: 'past-lead', deadline: '2026-10-01' }}
      type="lead"
      title="Engineer"
    />
  );
  expect(screen.getByText(/Overdue · 7 days ago/)).toHaveClass(
    'text-red-bright'
  );
});

it('saves a manual lead without a URL, creates and selects the company without losing the draft', async () => {
  render(
    <MemoryRouter>
      <JobLeadCaptureForm />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'New Job Lead' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Manual' }));
  fireEvent.change(screen.getByLabelText('Position'), {
    target: { value: 'Junior Engineer' },
  });
  fireEvent.click(screen.getByRole('combobox', { name: 'Company' }));
  const input = screen.getByRole('combobox', { name: 'Company' });
  fireEvent.change(input, { target: { value: 'New company' } });
  fireEvent.click(screen.getByRole('option', { name: /Create/ }));
  await waitFor(() =>
    expect(apiV030.createCompany).toHaveBeenCalledWith(
      { name: 'New company' },
      expect.any(String)
    )
  );
  fireEvent.change(screen.getByLabelText('Location'), {
    target: { value: 'Belgrade' },
  });
  fireEvent.click(screen.getByRole('combobox', { name: 'Work mode' }));
  fireEvent.click(screen.getByRole('option', { name: 'Hybrid' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Lead' }));
  await waitFor(() =>
    expect(createJobLead).toHaveBeenCalledWith(
      {
        title: 'Junior Engineer',
        company: 'Orbis Ledger',
        company_id: 'company-1',
        location: 'Belgrade',
        work_mode: 'hybrid',
      },
      expect.any(String)
    )
  );
});

it('saves pasted text without requiring a URL', async () => {
  render(
    <MemoryRouter>
      <JobLeadCaptureForm />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'New Job Lead' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Paste text' }));
  fireEvent.change(screen.getByLabelText('Posting text'), {
    target: { value: 'A saved job posting' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Lead' }));
  await waitFor(() =>
    expect(createJobLead).toHaveBeenCalledWith(
      { text: 'A saved job posting' },
      expect.any(String)
    )
  );
});

it('decides and resets a lead with the expected revision', async () => {
  const onUpdated = vi.fn();
  const view = render(<LeadDecision lead={lead} onUpdated={onUpdated} />);
  expect(screen.getByText('Not decided')).toBeVisible();
  fireEvent.click(screen.getByRole('radio', { name: 'Interesting' }));
  await waitFor(() =>
    expect(apiV030.updateLead).toHaveBeenCalledWith('lead-1', {
      decision: 'interesting',
      expected_revision: 4,
    })
  );
  view.rerender(
    <LeadDecision
      lead={{ ...lead, decision: 'interesting', revision: 5 }}
      onUpdated={onUpdated}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reset decision' }));
  await waitFor(() =>
    expect(apiV030.updateLead).toHaveBeenLastCalledWith('lead-1', {
      decision: null,
      expected_revision: 5,
    })
  );
});

it('fetches a source preview without saving until Save is clicked', async () => {
  const onUpdated = vi.fn();
  render(
    <SavedPosting
      id="lead-1"
      type="lead"
      revision={4}
      text="Old posting"
      url="https://example.org/job"
      onUpdated={onUpdated}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Fetch from URL' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'Fetched posting preview',
  });
  expect(within(dialog).getByLabelText('Posting text')).toHaveValue(
    'Fetched text'
  );
  expect(apiV030.replaceLeadSource).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(apiV030.replaceLeadSource).toHaveBeenCalledWith('lead-1', {
      text: 'Fetched text',
      expected_revision: 4,
    })
  );
  expect(onUpdated).toHaveBeenCalledOnce();
});

it('never clips over-limit posting text and counts Unicode characters', async () => {
  render(<SavedPosting id="lead-1" type="lead" revision={4} />);
  expect(screen.getByRole('button', { name: 'Fetch from URL' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Replace text' }));
  const textarea = screen.getByLabelText('Posting text');
  fireEvent.change(textarea, { target: { value: '😀'.repeat(100001) } });
  expect(screen.getByRole('alert')).toHaveTextContent('100,000');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(textarea).toHaveValue('😀'.repeat(100001));
  fireEvent.change(textarea, { target: { value: '😀'.repeat(100000) } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(apiV030.replaceLeadSource).toHaveBeenCalledWith('lead-1', {
      text: '😀'.repeat(100000),
      expected_revision: 4,
    })
  );
});

it('retains the source draft and its original revision on a conflicting save', async () => {
  vi.mocked(apiV030.replaceApplicationSource).mockRejectedValue(
    new Error('Conflict')
  );
  const view = render(
    <SavedPosting id="app-1" type="application" revision={3} text="Old text" />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Replace text' }));
  fireEvent.change(screen.getByLabelText('Posting text'), {
    target: { value: 'My correction' },
  });
  view.rerender(
    <SavedPosting
      id="app-1"
      type="application"
      revision={9}
      text="Newer text"
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('alert');
  expect(apiV030.replaceApplicationSource).toHaveBeenCalledWith('app-1', {
    text: 'My correction',
    expected_revision: 3,
  });
  expect(screen.getByLabelText('Posting text')).toHaveValue('My correction');
});

it('saves priority and tags without rebasing an open draft', async () => {
  const view = render(<RecordTags record={lead} type="lead" revision={4} />);
  fireEvent.click(screen.getByRole('button', { name: /Normal/ }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Priority' }));
  fireEvent.click(screen.getByRole('option', { name: 'High' }));
  fireEvent.change(screen.getByLabelText('Tags'), {
    target: { value: 'python' },
  });
  fireEvent.keyDown(screen.getByLabelText('Tags'), { key: 'Enter' });
  view.rerender(
    <RecordTags
      record={{ ...lead, priority: 'low' }}
      type="lead"
      revision={10}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(apiV030.updateLead).toHaveBeenCalledWith('lead-1', {
      priority: 'high',
      tags: ['python'],
      expected_revision: 4,
    })
  );
});

it('shows zero salary, pay period and a deadline shortcut in lead details', () => {
  render(
    <RecordDetails
      record={{
        id: 'lead-1',
        work_mode: 'hybrid',
        salary_min: 0,
        salary_max: 0,
        salary_currency: 'EUR',
        pay_period: 'month',
        deadline: '2026-10-10',
      }}
      type="lead"
      title="Orbis Ledger"
    />
  );
  expect(screen.getByText('0–0 EUR / month')).toBeVisible();
  expect(screen.getByText('Hybrid')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remind me' })).toBeVisible();
});

it('creates a deadline reminder only after confirmation, at 09:00 by default', async () => {
  vi.spyOn(apiV030, 'createReminder').mockResolvedValue({
    id: 'reminder-1',
  } as Awaited<ReturnType<typeof apiV030.createReminder>>);
  render(
    <DeadlineReminder
      id="lead-1"
      type="lead"
      deadline="2026-10-10"
      title="Orbis Ledger"
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remind me' }));
  const dialog = await screen.findByRole('dialog');
  expect(apiV030.createReminder).not.toHaveBeenCalled();
  expect(within(dialog).getByLabelText('Time')).toHaveValue('09:00');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(apiV030.createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: 'lead-1',
        kind: 'application_deadline',
        due_date: '2026-10-10',
        due_time: '09:00',
      })
    )
  );
});

it('lists kinds, bytes and dates, asks for kind on upload, and deletes only after confirmation', async () => {
  render(<ApplicationOtherFiles application={application} />);
  await screen.findByText('exercise.txt');
  expect(screen.getByText('Task')).toBeVisible();
  expect(screen.getByText(/2 KB/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Add file' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Kind' }));
  fireEvent.click(screen.getByRole('option', { name: 'Solution' }));
  const file = new File(['solution'], 'answer.txt', { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText('File'), {
    target: { files: [file] },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Upload' }).closest('form')!
  );
  await waitFor(() =>
    expect(apiV030.uploadAttachment).toHaveBeenCalledWith(
      'app-1',
      'solution',
      file
    )
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  );
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Delete exercise.txt' })[0]
  );
  expect(apiV030.deleteAttachment).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Delete exercise.txt' })[0]
  );
  await waitFor(() =>
    expect(apiV030.deleteAttachment).toHaveBeenCalledWith('file-1')
  );
  expect(
    screen.queryByText('These files are not used by AI.')
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Other files' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'These files are not used by AI.'
  );
});

it('retains the chosen file when upload fails', async () => {
  vi.mocked(apiV030.uploadAttachment).mockRejectedValue(
    new Error('Upload failed')
  );
  render(<ApplicationOtherFiles application={application} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add file' }));
  const file = new File(['task'], 'task.txt');
  fireEvent.change(screen.getByLabelText('File'), {
    target: { files: [file] },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Upload' }).closest('form')!
  );
  await screen.findByRole('alert');
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
});

it('normalizes metadata without inventing optional fields', () => {
  expect(jobMetadata()).toEqual({
    work_mode: null,
    employment_type: null,
    seniority: null,
    deadline: null,
    pay_period: null,
    company_id: null,
    priority: 'normal',
    tags: [],
  });
});
