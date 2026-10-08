import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { type Reminder, type Interview, type BoardCard } from '@/lib/apiV030';
import Tasks from './Tasks';
import { useTasksBadge } from '@/hooks/useTasksBadge';
import InterviewDetail from './InterviewDetail';
import ApplicationBoard from '@/components/ApplicationBoard';
import TargetReminders from '@/components/TargetReminders';
import DashboardUpcomingRow from '@/components/slots/DashboardUpcomingRow';
import DashboardPipelineStrip from '@/components/slots/DashboardPipelineStrip';
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }));
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    data: { time_zone_mode: 'manual', time_zone: 'UTC' },
  }),
}));
const adapter = api.defaults.adapter;
const statuses = [
  {
    id: 'applied',
    name: 'Applied',
    meaning: 'applied',
    color: '#88aa99',
    builtin_key: 'applied',
  },
  {
    id: 'interviewing',
    name: 'Interviewing',
    meaning: 'interviewing',
    color: '#ffaa55',
    builtin_key: 'interviewing',
  },
  {
    id: 'rejected',
    name: 'Rejected',
    meaning: 'rejected',
    color: '#ee5555',
    builtin_key: 'rejected',
  },
];
let reminder: Reminder;
let interview: Interview;
let card: BoardCard;
let requests: InternalAxiosRequestConfig[];
let conflict: boolean;
beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
  requests = [];
  conflict = false;
  reminder = {
    id: 'reminder-1',
    user_id: 'owner',
    kind: 'interview_preparation',
    title: 'Prepare SQL examples',
    note: null,
    due_at: new Date(Date.now() - 86_400_000).toISOString(),
    time_zone: 'UTC',
    state: 'open',
    completed_at: null,
    intent_id: 'intent',
    revision: 2,
    created_at: '2026-01-01T00:00Z',
    updated_at: '2026-01-01T00:00Z',
    application_id: 'app-1',
  };
  interview = {
    id: 'round-1',
    application_id: 'app-1',
    revision: 4,
    round_type: {
      id: 'technical',
      name: 'Technical',
      builtin_key: 'technical',
    },
    company: 'Orbis Ledger',
    company_id: 'company-1',
    job_title: 'Graduate Engineer',
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    completed_at: null,
    time_zone: 'UTC',
    duration_minutes: 60,
    mode: 'video',
    meeting_url: 'https://example.com/meeting',
    preparation: { review_topics: ['SQL grouping'] },
    questions_answers: [],
    notes_summary: 'Round summary',
    transcript_summary: null,
    transcript_path: null,
    transcript_original_filename: null,
    outcome: null,
    media: [],
    media_generation: 0,
    transcript_generation: 0,
    has_current_transcript: false,
    created_at: '2026-01-01T00:00Z',
    updated_at: '2026-01-01T00:00Z',
    contact_ids: [],
  };
  card = {
    id: 'app-1',
    company: 'Orbis Ledger',
    job_title: 'Graduate Engineer',
    status: statuses[0],
    evidence_revision: 7,
    applied_at: '2026-10-01',
    updated_at: '2026-10-08T10:00Z',
    created_at: '2026-10-01T00:00Z',
    location: 'Belgrade',
    job_url: null,
    archived_at: null,
    outcome_reason: null,
    source_text: null,
    source_revision: 0,
    confirmed_requirements: [],
    requirements_revision: 0,
    round_count: 1,
    next_interview_at: interview.scheduled_at!,
    open_reminder_count: 1,
    priority: 'high',
  };
  api.defaults.adapter = async (config) => {
    requests.push(config);
    let data: unknown = {};
    if (config.url === '/api/tasks')
      data = {
        items: [reminder],
        total: 1,
        page: 1,
        per_page: 100,
        deadlines: [
          {
            id: 'lead-1',
            target_type: 'lead',
            title: 'Saved lead deadline',
            due_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
          },
        ],
        badge: { total: 1, overdue: 1, due_today: 0 },
      };
    if (config.url === '/api/reminders') data = { items: [reminder], total: 1 };
    if (config.url === '/api/rounds') data = { items: [interview], total: 1 };
    if (config.url === '/api/rounds/round-1') data = interview;
    if (config.url === '/api/applications/app-1') data = card;
    if (
      config.url === '/api/contacts' ||
      config.url === '/api/notes' ||
      config.url === '/api/job-leads' ||
      config.url === '/api/companies' ||
      config.url === '/api/applications'
    )
      data = { items: [], total: 0 };
    if (config.url === '/api/statuses') data = statuses;
    if (config.url === '/api/round-types') data = [interview.round_type];
    if (config.url === '/api/applications/board')
      data = {
        columns: statuses.map((s) => ({
          status_id: s.id,
          count: s.id === card.status.id ? 1 : 0,
          items: s.id === card.status.id ? [card] : [],
          page: 1,
          per_page: 25,
        })),
      };
    if (config.url === '/api/dashboard/overview')
      data = {
        pipeline: statuses.map((s) => ({
          ...s,
          status_id: s.id,
          count: s.id === 'applied' ? 1 : 0,
        })),
        upcoming_interviews: [interview],
        tasks: [reminder],
        deadlines: [],
        recent_applications: [card],
        badge: { total: 1, overdue: 1, due_today: 0 },
      };
    if (config.method === 'patch' || config.method === 'post') {
      if (conflict)
        throw new AxiosError('Conflict', undefined, config, undefined, {
          data: {},
          status: 409,
          statusText: 'Conflict',
          headers: {},
          config,
        });
      const body = JSON.parse(config.data);
      if (config.url?.includes('/reminders')) {
        reminder = { ...reminder, ...body, revision: reminder.revision + 1 };
        data = reminder;
      }
      if (config.url === '/api/rounds/round-1') {
        interview = { ...interview, ...body, revision: interview.revision + 1 };
        data = interview;
      }
      if (config.url === '/api/applications/app-1') {
        card = {
          ...card,
          status: statuses.find((s) => s.id === body.status_id)!,
          evidence_revision: 8,
        };
        data = card;
      }
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  api.defaults.adapter = adapter;
});
function show(node: React.ReactNode, path = '/tasks') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}
const writes = () => requests.filter((r) => r.method !== 'get');
function BadgeProbe() {
  const badge = useTasksBadge();
  return (
    <span>
      {badge.count}:{badge.overdue ? 'overdue' : 'today'}
    </span>
  );
}
it('reads the full due-today and overdue count instead of counting a reminder page', async () => {
  show(<BadgeProbe />);
  expect(await screen.findByText('1:overdue')).toBeVisible();
  expect(
    String(requests.find((request) => request.url === '/api/tasks')?.params)
  ).toContain('per_page=1');
});
it('loads grouped tasks, keeps a deadline informational and completes with its revision', async () => {
  show(<Tasks />);
  expect(await screen.findByText('Prepare SQL examples')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Overdue' })).toBeVisible();
  expect(
    await screen.findByRole('link', {
      name: 'Orbis Ledger — Graduate Engineer',
    })
  ).toHaveAttribute('href', '/applications/app-1');
  expect(screen.getByText('Deadline: Saved lead deadline')).toBeVisible();
  expect(writes()).toHaveLength(0);
  fireEvent.click(
    screen.getByRole('button', { name: 'Complete Prepare SQL examples' })
  );
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(JSON.parse(writes()[0].data)).toEqual({
    expected_revision: 2,
    state: 'done',
  });
});
it('opens and cancels a date shortcut without creating a reminder; Save uses the user zone and one intent', async () => {
  show(
    <TargetReminders
      targetType="application"
      targetId="app-1"
      label="Orbis Ledger"
      shortcuts={[{ kind: 'application_deadline', date: '2026-10-14' }]}
    />
  );
  const shortcut = await screen.findByRole('button', { name: /Remind me/ });
  await waitFor(() => expect(shortcut).toBeEnabled());
  fireEvent.click(shortcut);
  expect(shortcut.querySelector('i')).toHaveClass('bi-bell');
  expect(screen.getByLabelText('Date')).toHaveValue('2026-10-14');
  expect(screen.getByLabelText('Time')).toHaveValue('09:00');
  expect(writes()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(writes()).toHaveLength(0);
  fireEvent.click(shortcut);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(JSON.parse(writes()[0].data)).toMatchObject({
    application_id: 'app-1',
    time_zone: 'UTC',
    due_date: '2026-10-14',
    due_time: '09:00',
    kind: 'application_deadline',
  });
});
it('opens an existing kind instead of creating another reminder', async () => {
  show(
    <TargetReminders
      targetType="application"
      targetId="app-1"
      label="Orbis Ledger"
      shortcuts={[{ kind: 'interview_preparation', date: '2026-10-14' }]}
    />
  );
  const shortcut = await screen.findByRole('button', { name: /Remind me/ });
  await waitFor(() => expect(shortcut).toBeEnabled());
  fireEvent.click(shortcut);
  expect(screen.getByRole('dialog', { name: 'Edit reminder' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(writes()[0].method).toBe('patch');
});
it('shows calendar chips linked to interviews, then a Monday-first week list', async () => {
  show(<Tasks />, '/tasks?view=interviews');
  const links = await screen.findAllByRole('link', { name: /Orbis Ledger/ });
  expect(
    links.some((l) => l.getAttribute('href') === '/interviews/round-1')
  ).toBe(true);
  const table = screen.getByRole('table', { name: 'Interview calendar' });
  expect(within(table).getAllByRole('columnheader')[0]).toHaveTextContent(
    'Mon'
  );
  fireEvent.click(screen.getAllByRole('radio', { name: 'Week' })[0]);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous week' })).toBeVisible();
  expect(writes()).toHaveLength(0);
});
it('keeps board cards in place on Cancel and opens a keyboard Move to dialog with revision guarded Save', async () => {
  show(
    <ApplicationBoard
      params={new URLSearchParams('view=board&source=Referral&priority=high')}
    />
  );
  await screen.findByText('Orbis Ledger');
  const boardRequest = requests.find(
    (r) => r.url === '/api/applications/board'
  )!;
  expect(String(boardRequest.params)).toContain('priority=high');
  fireEvent.click(screen.getByLabelText('Actions for Orbis Ledger'));
  fireEvent.click(screen.getByRole('button', { name: 'Interviewing' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(writes()).toHaveLength(0);
  expect(
    within(screen.getByRole('region', { name: 'Applied' })).getByText(
      'Orbis Ledger'
    )
  ).toBeVisible();
  fireEvent.click(screen.getByLabelText('Actions for Orbis Ledger'));
  fireEvent.click(screen.getByRole('button', { name: 'Interviewing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(JSON.parse(writes()[0].data)).toMatchObject({
    expected_revision: 7,
    status_id: 'interviewing',
  });
});
it('reports stale board writes without moving the card', async () => {
  conflict = true;
  show(<ApplicationBoard />);
  await screen.findByText('Orbis Ledger');
  fireEvent.click(screen.getByLabelText('Actions for Orbis Ledger'));
  fireEvent.click(screen.getByRole('button', { name: 'Interviewing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      'This application changed. Reload to continue.'
    )
  );
  expect(
    within(screen.getByRole('region', { name: 'Applied' })).getByText(
      'Orbis Ledger'
    )
  ).toBeVisible();
});
it('shows interview sections and recording controls only on its detail page; manual preparation saves all seven lists', async () => {
  show(
    <Routes>
      <Route path="/interviews/:id" element={<InterviewDetail />} />
    </Routes>,
    '/interviews/round-1'
  );
  await screen.findByRole('heading', { name: 'Technical', level: 1 });
  expect(screen.getByRole('link', { name: 'Join meeting' })).toHaveAttribute(
    'href',
    'https://example.com/meeting'
  );
  expect(screen.getByText('SQL grouping')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add transcript' })).toBeVisible();
  expect(writes()).toHaveLength(0);
  const preparation = screen
    .getByRole('button', { name: 'Preparation' })
    .closest('section')!;
  fireEvent.click(within(preparation).getByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('Profile gaps')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Topics to review'), {
    target: { value: 'SQL grouping\nNull handling' },
  });
  fireEvent.click(within(preparation).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(JSON.parse(writes()[0].data)).toMatchObject({
    expected_revision: 4,
    preparation: {
      review_topics: ['SQL grouping', 'Null handling'],
      technical_topics: [],
      practice_questions: [],
      company_questions: [],
      examples: [],
      profile_gaps: [],
      plan: [],
    },
  });
});
it('shows the new dashboard row and pipeline status links without starting any work', async () => {
  show(
    <>
      <DashboardPipelineStrip />
      <DashboardUpcomingRow />
    </>,
    '/'
  );
  await screen.findByText('Upcoming Interviews');
  await screen.findByRole('link', { name: 'Open calendar →' });
  expect(screen.getAllByRole('link', { name: 'Applied 1' })[0]).toHaveAttribute(
    'href',
    '/applications?status=applied'
  );
  expect(screen.getByText('Recently Updated')).toBeVisible();
  expect(screen.queryByText(/tasks\./)).not.toBeInTheDocument();
  expect(writes()).toHaveLength(0);
});
