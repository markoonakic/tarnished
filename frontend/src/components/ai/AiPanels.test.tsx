import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
    confirmRequirements: vi.fn(),
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

it.each([
  ['en', 'Years of experience: 1'],
  ['sr-Latn', 'Godine iskustva: 1'],
])('shows a human scalar evidence label in %s', async (language, label) => {
  await i18n.changeLanguage(language);
  latest(
    {
      ...base,
      kind: 'PROFILE_MATCH',
      draft: {
        rows: [
          {
            requirement_id: 'r1',
            state: 'confirmed',
            why: 'Saved data',
            evidence: [{ profile_id: 'years_experience', quote: '1.0' }],
          },
        ],
      },
    },
    base.requirements,
    [{ id: 'years_experience', name: 'years_experience', text: '1.0' }]
  );
  render(
    <MemoryRouter>
      <ProfileMatch target={{ lead_id: 'lead' }} legacy={['Basic Python']} />
    </MemoryRouter>
  );
  expect(await screen.findByRole('link', { name: label })).toHaveAttribute(
    'href',
    '/profile#years_experience'
  );
  expect(
    screen.queryByText(/Not reviewed|Nije pregledano/)
  ).not.toBeInTheDocument();
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
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Accept all' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save reviewed' })).toBeEnabled()
  );
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
it.each([{ lead_id: 'lead' }, { application_id: 'app' }])(
  'guards review drafts and pending saves for %j',
  async (target) => {
    let release!: (analysis: Analysis) => void;
    vi.mocked(analysesApi.review).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    render(<ExtractionReview target={target} source="Python required" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit Python' })).toBeEnabled()
    );
    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Python' }));
    fireEvent.change(await screen.findByLabelText('Edit proposed value'), {
      target: { value: 'Edited Python' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    const draft = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(draft);
    expect(draft.defaultPrevented).toBe(true);
    expect(screen.getByText('Edited Python')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save reviewed' }));
    const saving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(saving);
    expect(saving.defaultPrevented).toBe(true);
    expect(screen.getByText('Edited Python')).toBeVisible();
    await act(async () =>
      release({
        ...base,
        revision: 3,
        review_state: 'saved',
        reviewed: [{ ...proposal, decision: 'edited', value: 'Edited Python' }],
      })
    );
    await screen.findByRole('button', { name: 'Run again' });
    const saved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
  }
);

it('removes the review exit guard after Undo and keeps choices on failed save', async () => {
  vi.mocked(analysesApi.review).mockRejectedValueOnce(new Error('Offline'));
  render(
    <ExtractionReview target={{ lead_id: 'lead' }} source="Python required" />
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Accept Python' }));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  const undone = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(undone);
  expect(undone.defaultPrevented).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Accept Python' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save reviewed' }));
  await screen.findByRole('alert');
  const failed = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(failed);
  expect(failed.defaultPrevented).toBe(true);
  expect(screen.getByText('Accepted')).toBeVisible();
});

it('Accept all keeps existing edits and rejections', async () => {
  latest({
    ...base,
    draft: {
      items: [
        proposal,
        { ...proposal, id: 'r2', value: 'SQL' },
        { ...proposal, id: 'r3', value: 'Redis' },
      ],
    },
  });
  vi.mocked(analysesApi.review).mockResolvedValue({
    ...base,
    review_state: 'saved',
  });
  render(
    <ExtractionReview target={{ lead_id: 'lead' }} source="Python required" />
  );
  const edit = await screen.findByRole('button', { name: 'Edit Python' });
  await waitFor(() => expect(edit).toBeEnabled());
  fireEvent.click(edit);
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Edit proposed value' }),
    { target: { value: 'Python services' } }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reject SQL' }));
  fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));
  expect(screen.getByText('Python services')).toBeVisible();
  expect(screen.getByText('Rejected')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save reviewed' }));
  await waitFor(() =>
    expect(analysesApi.review).toHaveBeenCalledWith(
      expect.objectContaining({ id: base.id }),
      expect.arrayContaining([
        { id: 'r1', decision: 'edited', value: 'Python services' },
        { id: 'r2', decision: 'rejected', value: 'SQL' },
        { id: 'r3', decision: 'accepted', value: 'Redis' },
      ])
    )
  );
});

it.each(['en', 'sr-Latn'])(
  'keeps edited-value guidance behind a HelpTip in %s',
  async (language) => {
    await i18n.changeLanguage(language);
    render(
      <ExtractionReview target={{ lead_id: 'lead' }} source="Python required" />
    );
    const edit = await screen.findByRole('button', {
      name: i18n.t('ai.editRow', { value: 'Python' }),
    });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.click(edit);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Edited Python' },
    });
    const message = i18n.t('ai.userEdited');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('ai.editedValueHelp') })
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(message);
  }
);
it('keeps edited drafts after conflict, supports reject and undo', async () => {
  vi.mocked(analysesApi.review).mockRejectedValue(new Error('409'));
  render(
    <ExtractionReview target={{ lead_id: 'lead' }} source="Python required" />
  );
  const edit = await screen.findByRole('button', { name: 'Edit Python' });
  await waitFor(() => expect(edit).toBeEnabled());
  fireEvent.click(edit);
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
it.each([true, false])(
  'Accept all saves a matching or new company (existing=%s)',
  async (existing) => {
    const company = { id: 'north', name: ' north ' } as Awaited<
      ReturnType<typeof apiV030.createCompany>
    >;
    vi.mocked(apiV030.companies).mockResolvedValue({
      items: existing ? [company] : [],
      page: 1,
      per_page: 100,
      total: existing ? 1 : 0,
    });
    vi.mocked(apiV030.createCompany).mockResolvedValue(company);
    const analysis = {
      ...base,
      draft: {
        items: [
          { id: 'company', field: 'company', value: 'NORTH', quote: 'North' },
        ],
      },
    };
    latest(analysis);
    vi.mocked(analysesApi.review).mockResolvedValue({
      ...analysis,
      review_state: 'saved',
      reviewed: [{ ...analysis.draft.items[0], decision: 'accepted' }],
    });
    const onUpdated = vi.fn();
    render(
      <ExtractionReview
        target={{ lead_id: 'lead' }}
        source="North"
        onUpdated={onUpdated}
      />
    );
    const accept = await screen.findByRole('button', { name: 'Accept all' });
    await screen.findByText(existing ? /Existing company/ : 'New company');
    await waitFor(() => expect(accept).toBeEnabled());
    expect(
      screen.getByRole('button', { name: 'Save reviewed' })
    ).toHaveAttribute(
      'title',
      'Accept, edit or reject a proposal before saving.'
    );
    fireEvent.click(accept);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save reviewed' })
      ).toBeEnabled()
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save reviewed' }));
    await waitFor(() =>
      expect(analysesApi.review).toHaveBeenCalledWith(analysis, [
        {
          id: 'company',
          decision: 'accepted',
          value: 'NORTH',
          company_id: 'north',
        },
      ])
    );
    if (existing) expect(apiV030.createCompany).not.toHaveBeenCalled();
    else
      expect(apiV030.createCompany).toHaveBeenCalledWith(
        { name: 'NORTH' },
        expect.any(String)
      );
    await screen.findByText(/Saved .* · 1 field/);
    expect(onUpdated).toHaveBeenCalledOnce();
  }
);
it('company Edit uses the existing combobox and marks a new company without creating it early', async () => {
  latest({
    ...base,
    draft: {
      items: [{ id: 'c', field: 'company', value: 'North', quote: 'North' }],
    },
  });
  render(<ExtractionReview target={{ lead_id: 'lead' }} source="North" />);
  const edit = await screen.findByRole('button', { name: 'Edit North' });
  await waitFor(() => expect(edit).toBeEnabled());
  fireEvent.click(edit);
  const picker = screen.getByRole('combobox', {
    name: 'Choose or create a company',
  });
  fireEvent.change(picker, { target: { value: 'South' } });
  fireEvent.click(screen.getByRole('option', { name: '+ Create "South"' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByText('South')).toBeInTheDocument();
  expect(screen.getByText('New company')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save reviewed' })).toBeEnabled();
  expect(apiV030.createCompany).not.toHaveBeenCalled();
});
it.each(['en', 'sr-Latn'])(
  'auto-applied extraction shows only its saved summary in %s',
  async (language) => {
    await i18n.changeLanguage(language);
    latest({
      ...base,
      review_state: 'saved',
      reviewed: [{ ...proposal, decision: 'accepted' }],
    });
    const onUpdated = vi.fn();
    render(
      <ExtractionReview
        target={{ lead_id: 'lead' }}
        source="Python required"
        onUpdated={onUpdated}
      />
    );
    await screen.findByRole('button', { name: i18n.t('ai.runAgain') });
    expect(onUpdated).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        language === 'en' ? /Saved .* · 1 field/ : /Sačuvano .* · 1 polje/
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: i18n.t('ai.acceptAll') })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Python')).not.toBeInTheDocument();
  }
);
it('refreshes the record once when a polling read finds an automatic save', async () => {
  const onUpdated = vi.fn();
  const view = render(
    <ExtractionReview
      target={{ lead_id: 'lead' }}
      source="Python required"
      onUpdated={onUpdated}
    />
  );
  await screen.findByRole('button', { name: 'Accept all' });
  latest({
    ...base,
    review_state: 'saved',
    reviewed: [{ ...proposal, decision: 'accepted' }],
  });
  view.rerender(
    <ExtractionReview
      target={{ lead_id: 'lead' }}
      refreshKey={1}
      source="Python required"
      onUpdated={onUpdated}
    />
  );
  await screen.findByRole('button', { name: 'Run again' });
  expect(onUpdated).toHaveBeenCalledOnce();
  view.rerender(
    <ExtractionReview
      target={{ lead_id: 'lead' }}
      refreshKey={2}
      source="Python required"
      onUpdated={onUpdated}
    />
  );
  await waitFor(() => expect(analysesApi.latest).toHaveBeenCalledTimes(3));
  expect(onUpdated).toHaveBeenCalledOnce();
});
it('company Edit preselects the match and can choose another existing company', async () => {
  const companies = [
    { id: 'north', name: ' north ' },
    { id: 'south', name: 'South' },
  ] as Awaited<ReturnType<typeof apiV030.companies>>['items'];
  vi.mocked(apiV030.companies).mockResolvedValue({
    items: companies,
    page: 1,
    per_page: 100,
    total: 2,
  });
  const analysis = {
    ...base,
    draft: {
      items: [{ id: 'c', field: 'company', value: 'NORTH', quote: 'North' }],
    },
  };
  latest(analysis);
  vi.mocked(analysesApi.review).mockResolvedValue({
    ...analysis,
    review_state: 'saved',
    reviewed: [{ ...analysis.draft.items[0], decision: 'edited' }],
  });
  render(<ExtractionReview target={{ lead_id: 'lead' }} source="North" />);
  await screen.findByText(/Existing company/);
  fireEvent.click(screen.getByRole('button', { name: 'Edit NORTH' }));
  const picker = screen.getByRole('combobox');
  expect(picker).toHaveValue(' north ');
  fireEvent.focus(picker);
  fireEvent.change(picker, { target: { value: 'South' } });
  fireEvent.click(screen.getByRole('option', { name: 'South' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save reviewed' }));
  await waitFor(() =>
    expect(analysesApi.review).toHaveBeenCalledWith(analysis, [
      { id: 'c', decision: 'edited', value: 'South', company_id: 'south' },
    ])
  );
  expect(apiV030.createCompany).not.toHaveBeenCalled();
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
  expect(screen.queryByText(/not your ability/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Profile match' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent(/not your ability/);
  expect(
    screen.queryByRole('button', { name: 'Edit' })
  ).not.toBeInTheDocument();
  expect(analysesApi.run).not.toHaveBeenCalled();
});
it('offers extraction instead of a silently disabled comparison when requirements are missing', async () => {
  latest(null, [], []);
  render(
    <MemoryRouter>
      <ProfileMatch target={{ lead_id: 'lead' }} />
    </MemoryRouter>
  );
  expect(
    await screen.findByRole('button', { name: 'Extract with AI' })
  ).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: 'Compare with profile' })
  ).not.toBeInTheDocument();
});
it('confirms the current list explicitly before enabling comparison', async () => {
  latest(null, [], base.profile);
  render(
    <MemoryRouter>
      <ProfileMatch
        target={{ application_id: 'app' }}
        refreshKey={4}
        legacy={['Python']}
      />
    </MemoryRouter>
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Use these requirements' })
  );
  expect(screen.getByRole('dialog')).toHaveTextContent('Python');
  expect(analysesApi.confirmRequirements).not.toHaveBeenCalled();
  latest(null, base.requirements, base.profile);
  vi.mocked(analysesApi.confirmRequirements).mockResolvedValue({
    requirements: base.requirements,
    revision: 5,
  });
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Use these requirements',
    })
  );
  expect(
    await screen.findByRole('button', { name: 'Compare with profile' })
  ).toBeEnabled();
  expect(analysesApi.confirmRequirements).toHaveBeenCalledWith(
    { application_id: 'app' },
    4
  );
  expect(analysesApi.run).not.toHaveBeenCalled();
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
  const checkbox = await screen.findByRole('checkbox');
  await waitFor(() => expect(checkbox).toBeEnabled());
  fireEvent.click(checkbox);
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
  const discard = await screen.findByRole('button', { name: 'Discard' });
  await waitFor(() => expect(discard).toBeEnabled());
  fireEvent.click(discard);
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
  render(
    <MemoryRouter>
      <AnalyticsAiInsights period="all" />
    </MemoryRouter>
  );
  await screen.findByText('Requirement 0');
  expect(screen.queryByText('Requirement 5')).not.toBeInTheDocument();
  expect(
    screen.queryByText('From 8 reviewed postings.')
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Repeated requirements' })
  );
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'From 8 reviewed postings.'
  );
  fireEvent.click(screen.getByRole('button', { name: 'View all' }));
  expect(screen.getByText('Requirement 5')).toBeInTheDocument();
});
