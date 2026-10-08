import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import {
  analysesApi,
  preparationCategories,
  type Analysis,
  type AnalysisRead,
} from '@/lib/apiAnalyses';
import { apiV030 } from '@/lib/apiV030';
import ExtractionReview from './ExtractionReview';
import ProfileMatch from './ProfileMatch';
import PreparationDraft from './PreparationDraft';
import AnalyticsAiInsights from '@/components/slots/AnalyticsAiInsights';
import en from '@/locales/areas/ai.en.json';
import sr from '@/locales/areas/ai.sr-Latn.json';

vi.mock('@/lib/apiAnalyses', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/apiAnalyses')>()),
  analysesApi: {
    latest: vi.fn(),
    create: vi.fn(),
    run: vi.fn(),
    review: vi.fn(),
    apply: vi.fn(),
    discard: vi.fn(),
    read: vi.fn(),
  },
}));
vi.mock('@/lib/apiV030', () => ({
  apiV030: { companies: vi.fn(), createCompany: vi.fn(), breakdowns: vi.fn() },
}));
const proposal = {
  id: 'r1',
  field: 'must_have',
  value: 'Python',
  quote: 'Python required',
};
const base: Analysis = {
  id: 'a1',
  kind: 'EXTRACTION',
  revision: 2,
  target_revision: 4,
  state: 'complete',
  review_state: 'ready',
  stale: false,
  error: null,
  updated_at: '2026-10-08T12:00:00Z',
  draft: { items: [proposal] },
  reviewed: [],
  requirements: [{ id: 'r1', text: 'Python' }],
  profile: [{ id: 'p1', name: 'Ledger', text: 'Python service' }],
};
function latest(
  analysis: Analysis | null,
  requirements = base.requirements,
  profile = base.profile
) {
  vi.mocked(analysesApi.latest).mockResolvedValue({
    analysis,
    requirements,
    profile,
  } as AnalysisRead);
}
beforeEach(async () => {
  vi.resetAllMocks();
  await i18n.changeLanguage('en');
  latest(base);
  vi.mocked(apiV030.companies).mockResolvedValue({
    items: [],
    page: 1,
    per_page: 100,
    total: 0,
  });
});
afterEach(cleanup);

it('reuses an uncertain intent only after an explicit retry', async () => {
  const pending = { ...base, revision: 0, state: 'pending', draft: {} };
  latest(null);
  vi.mocked(analysesApi.create).mockResolvedValue(pending);
  vi.mocked(analysesApi.run)
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce({ ...pending, state: 'queued' });
  render(
    <ExtractionReview
      target={{ application_id: 'app' }}
      source="Python required"
    />
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Extract with AI' })
    ).toBeEnabled()
  );
  latest(pending);
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  await screen.findByRole('alert');
  expect(analysesApi.run).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
  await waitFor(() => expect(analysesApi.run).toHaveBeenCalledTimes(2));
  expect(analysesApi.create).toHaveBeenCalledOnce();
  expect(vi.mocked(analysesApi.run).mock.calls[0][1]).toBe(
    vi.mocked(analysesApi.run).mock.calls[1][1]
  );
});

it('does not replay an uncertain request after navigation to another record', async () => {
  latest(null);
  vi.mocked(analysesApi.create).mockResolvedValue({
    ...base,
    state: 'pending',
    draft: {},
  });
  vi.mocked(analysesApi.run).mockRejectedValue(new Error('Connection lost'));
  const view = render(
    <ExtractionReview
      target={{ application_id: 'first' }}
      source="Python required"
    />
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Extract with AI' })
    ).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  await screen.findByRole('alert');
  view.rerender(
    <ExtractionReview
      target={{ application_id: 'second' }}
      source="SQL required"
    />
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Extract with AI' })
    ).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  await waitFor(() => expect(analysesApi.create).toHaveBeenCalledTimes(2));
  expect(analysesApi.create).toHaveBeenLastCalledWith(
    'EXTRACTION',
    { lead_id: undefined, application_id: 'second', round_id: undefined },
    'en'
  );
});

it('has complete natural Serbian area strings', () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(sr).sort());
  expect(sr['ai.profileMatch']).toBe('Poređenje sa profilom');
});
it('reads without starting AI, saves reviewed choices atomically and collapses', async () => {
  vi.mocked(analysesApi.review).mockResolvedValue({
    ...base,
    review_state: 'saved',
    reviewed: [{ ...proposal, decision: 'accepted' }],
  });
  const updated = vi.fn();
  render(
    <ExtractionReview
      target={{ application_id: 'app' }}
      source="Python required"
      onUpdated={updated}
    />
  );
  await screen.findByRole('button', { name: 'Accept Python' });
  expect(analysesApi.create).not.toHaveBeenCalled();
  expect(analysesApi.run).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save reviewed' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save reviewed' }));
  await waitFor(() =>
    expect(analysesApi.review).toHaveBeenCalledWith(base, [
      { id: 'r1', decision: 'accepted', value: 'Python' },
    ])
  );
  await screen.findByRole('button', { name: 'Run again' });
  expect(updated).toHaveBeenCalledOnce();
  expect(
    screen.queryByRole('button', { name: 'Accept Python' })
  ).not.toBeInTheDocument();
});
it('keeps edited drafts after conflict, supports reject and undo', async () => {
  vi.mocked(analysesApi.review).mockRejectedValue(new Error('409'));
  render(
    <ExtractionReview target={{ lead_id: 'lead' }} source="Python required" />
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Python' }));
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Edit proposed value' }),
    { target: { value: 'Python services' } }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save reviewed' }));
  await screen.findByRole('alert');
  expect(screen.getByText('Python services')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reject Python' }));
  expect(screen.getByText('Rejected')).toBeInTheDocument();
});
it('requires an explicit company picker selection before Accept all can save', async () => {
  latest({
    ...base,
    draft: {
      items: [
        { id: 'company', field: 'company', value: 'North', quote: 'North' },
      ],
    },
  });
  render(<ExtractionReview target={{ lead_id: 'lead' }} source="North" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Accept all' }));
  expect(screen.getByRole('button', { name: 'Save reviewed' })).toBeDisabled();
  expect(screen.getByText('Choose or create a company')).toBeInTheDocument();
});
it('shows a read-only matrix, exact evidence, footer and stale banner', async () => {
  latest({
    ...base,
    kind: 'PROFILE_MATCH',
    stale: true,
    draft: {
      rows: [
        {
          requirement_id: 'r1',
          state: 'partial',
          evidence: [{ profile_id: 'p1', quote: 'Python service' }],
          why: 'Related saved project',
        },
      ],
    },
  });
  render(
    <MemoryRouter>
      <ProfileMatch target={{ application_id: 'app' }} />
    </MemoryRouter>
  );
  await screen.findByText('Related saved project');
  expect(screen.getByRole('link', { name: 'Ledger' })).toHaveAttribute(
    'href',
    '/profile#p1'
  );
  expect(
    screen.getByText(/Your profile or the requirements changed/)
  ).toBeInTheDocument();
  expect(screen.getByText(/not your ability/)).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Edit' })
  ).not.toBeInTheDocument();
  expect(analysesApi.run).not.toHaveBeenCalled();
});
it('disables match until requirements are confirmed', async () => {
  latest(null, [], []);
  render(
    <MemoryRouter>
      <ProfileMatch target={{ lead_id: 'lead' }} />
    </MemoryRouter>
  );
  await screen.findByText('Review the extracted requirements first.');
  expect(
    screen.getByRole('button', { name: 'Compare with profile' })
  ).toBeDisabled();
});
it('selects preparation suggestions and appends only selected IDs', async () => {
  const draft: Analysis = {
    ...base,
    kind: 'PREPARATION',
    draft: {
      ...Object.fromEntries(preparationCategories.map((key) => [key, []])),
      practice_questions: [
        {
          id: 'q1',
          text: 'How do joins work?',
          requirement_ids: ['r1'],
          evidence: [],
        },
      ],
    },
  };
  latest(draft);
  vi.mocked(analysesApi.apply).mockResolvedValue({
    ...draft,
    review_state: 'saved',
  });
  render(
    <MemoryRouter>
      <PreparationDraft applicationId="app" roundId="round" revision={3} />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole('checkbox'));
  expect(screen.getByText('suggestion', { exact: false })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save selected (1)' }));
  await waitFor(() =>
    expect(analysesApi.apply).toHaveBeenCalledWith(draft, 3, ['q1'])
  );
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
it('persists Discard without changing interview preparation', async () => {
  const draft: Analysis = {
    ...base,
    kind: 'PREPARATION',
    draft: {
      plan: [
        {
          id: 'p',
          text: 'Practice SQL',
          requirement_ids: ['r1'],
          evidence: [],
        },
      ],
    },
  };
  latest(draft);
  vi.mocked(analysesApi.discard).mockResolvedValue({
    ...draft,
    review_state: 'discarded',
  });
  render(
    <MemoryRouter>
      <PreparationDraft applicationId="app" roundId="round" revision={3} />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
  await waitFor(() => expect(analysesApi.discard).toHaveBeenCalledWith(draft));
  expect(analysesApi.apply).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.queryByText('Draft — not saved')).not.toBeInTheDocument()
  );
});

it('shows five insight rows, coverage denominators, and expands all', async () => {
  vi.mocked(apiV030.breakdowns).mockResolvedValue({
    first_response: { mean_days: null, n: 0, unknown_count: 0 },
    rejected_count: 0,
    current_phases: [],
    outcomes_by_source: [],
    top_positions: [],
    top_technologies: [],
    stage_averages: [],
    as_of: '2026-10-08T12:00:00Z',
    repeated_requirements: {
      items: Array.from({ length: 6 }, (_, i) => ({
        label: `Requirement ${i}`,
        count: 6 - i,
      })),
      denominator: 8,
    },
    missing_evidence: { items: [], denominator: 0 },
  } as Awaited<ReturnType<typeof apiV030.breakdowns>>);
  render(<AnalyticsAiInsights period="all" />);
  await screen.findByText('Requirement 0');
  expect(screen.queryByText('Requirement 5')).not.toBeInTheDocument();
  expect(screen.getByText('From 8 reviewed postings.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View all' }));
  expect(screen.getByText('Requirement 5')).toBeInTheDocument();
});
