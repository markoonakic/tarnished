import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post, safeErrorMessage } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  safeErrorMessage: vi.fn((_detail: unknown, fallback: string) => fallback),
}));

vi.mock('../lib/api', () => ({
  default: { get, post },
  safeErrorMessage,
}));

import { invalidateEvidenceQueries, queryClient } from '../lib/queryClient';
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));

import ScopedReport, {
  type ScopedReportState,
} from '../components/ScopedReport';

function state(overrides: Partial<ScopedReportState> = {}): ScopedReportState {
  return {
    generation: 0,
    stale_reason: null,
    capability: {
      available: true,
      provider: 'openai',
      model: 'openai/synthetic-text',
      configuration_revision: 'rev-1',
      input_disclosure: 'Saved job requirements only.',
      external_processing: 'Sent to the configured service only on request.',
      message: 'Configured is not verified.',
    },
    job: null,
    report: null,
    ...overrides,
  };
}

const props = {
  title: 'Application feedback',
  scope: 'APPLICATION',
  endpoint: '/api/applications/a1/feedback',
  requestBody: (value: ScopedReportState) => ({
    generation: value.generation,
    config_revision: value.capability.configuration_revision,
  }),
  requestLabel: 'application feedback',
};

type Props = typeof props & { emptyHint?: string };

async function renderReport(
  payload: ScopedReportState,
  overrides: Partial<Props> = {}
) {
  get.mockResolvedValue({ data: payload });
  render(<ScopedReport {...props} {...overrides} />);
  await waitFor(() => expect(get).toHaveBeenCalled());
  await screen.findByRole('heading', { name: props.title });
  await waitFor(() =>
    expect(
      screen.queryByText('Loading saved feedback…')
    ).not.toBeInTheDocument()
  );
}

const requestButton = () =>
  screen.getByRole('button', { name: /: application feedback$/i });

describe('ScopedReport', () => {
  beforeEach(() => {
    queryClient.clear();
    get.mockReset();
    post.mockReset();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  it.each(['ready', 'different-period', 'running'])(
    'keeps pipeline %s copy to one status and an optional saved-result note',
    async (phase) => {
      await renderReport(
        state({
          period: phase === 'ready' ? '7d' : '30d',
          stale_reason:
            phase === 'ready'
              ? null
              : 'pipeline scope or text configuration changed; rerun required',
          job:
            phase === 'running'
              ? {
                  id: 'job',
                  period: '30d',
                  state: 'analyzing',
                  uncertain: false,
                  error: null,
                  completed_sections: 0,
                  total_sections: 1,
                }
              : null,
          report: {
            period: '7d',
            as_of: '2026-10-04T09:00:00Z',
            time_zone: 'UTC',
            run_at: '2026-10-04T09:00:00Z',
            provider: 'fixture',
            model: 'test',
            findings: [
              {
                observation: 'Saved observation',
                interpretation: 'Saved explanation',
                action: 'Keep this saved action.',
                limitations: 'Recorded facts only.',
                citations: [],
              },
            ],
            sources: [
              {
                id: 'pipeline:metrics:0',
                kind: 'pipeline_metrics',
                text: JSON.stringify({
                  total_applications: 3,
                  scope: {
                    cohort_start: '2026-09-28',
                    cohort_end: '2026-10-04',
                    time_zone: 'UTC',
                  },
                }),
              },
            ],
            limitations: [],
            coverage: { sections: 1, sources: 1, characters: 10 },
          },
        }),
        { scope: 'PIPELINE' }
      );
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveTextContent(
        phase === 'ready'
          ? 'Last 7 days · 10/4/2026'
          : phase === 'running'
            ? 'Preparing feedback for Last 30 days…'
            : 'Saved feedback is for Last 7 days.'
      );
      expect(
        screen.queryByText(
          /Feedback ready|Saved feedback:|Applied-date cohort|saved snapshot|keep using this page|Saved feedback from|different period or/
        )
      ).not.toBeInTheDocument();
      if (phase === 'running') {
        expect(
          screen.getByText('Showing saved feedback for Last 7 days.')
        ).toBeVisible();
        expect(
          screen.queryByRole('button', { name: /: application feedback$/i })
        ).not.toBeInTheDocument();
      } else expect(requestButton()).toBeEnabled();
      expect(screen.getByText('Keep this saved action.')).toBeVisible();
      expect(post).not.toHaveBeenCalled();
    }
  );

  it('keeps application progress short while retaining an older stale result', async () => {
    await renderReport(
      state({
        stale_reason: 'application evidence changed; rerun required',
        job: {
          id: 'job',
          state: 'analyzing',
          uncertain: false,
          error: null,
          completed_sections: 0,
          total_sections: 1,
        },
        report: {
          run_at: '2026-10-04',
          provider: 'fixture',
          model: 'test',
          findings: [],
          sources: [],
          limitations: [],
          coverage: { sections: 1, sources: 1, characters: 10 },
        },
      })
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing feedback…');
    expect(screen.getByText('Showing saved feedback.')).toBeVisible();
    expect(
      screen.queryByText(
        /saved information has changed|keep using|Saved feedback from/
      )
    ).not.toBeInTheDocument();
  });

  it('loads status without dispatching any work', async () => {
    await renderReport(state(), {
      emptyHint: 'No saved application report yet.',
    });
    expect(get.mock.calls.map(([url]) => url)).toContain(
      '/api/applications/a1/feedback'
    );
    expect(post).not.toHaveBeenCalled();
    expect(
      screen.getByText(/No saved application report yet/i)
    ).toBeInTheDocument();
  });

  it('sends only the generation, config revision and an intent id', async () => {
    await renderReport(state());
    post.mockResolvedValue({
      data: {
        id: 'new-job',
        state: 'queued',
        uncertain: false,
        error: null,
        completed_sections: 0,
        total_sections: 1,
      },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Get feedback: application feedback/i,
      })
    );
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/api/applications/a1/feedback');
    expect(Object.keys(body).sort()).toEqual([
      'config_revision',
      'generation',
      'intent_id',
    ]);
    expect(body.generation).toBe(0);
    expect(body.config_revision).toBe('rev-1');
  });

  it('disables the request when the capability is unavailable', async () => {
    await renderReport(
      state({ capability: { ...state().capability, available: false } })
    );
    expect(requestButton()).toBeDisabled();
  });

  it('does not claim missing feedback is outdated or quietly rerun it', async () => {
    await renderReport(state({ stale_reason: 'application evidence changed' }));
    expect(
      screen.queryByText(/out of date|Update this feedback/i)
    ).not.toBeInTheDocument();
    expect(requestButton()).toBeEnabled();
    expect(post).not.toHaveBeenCalled();
  });

  it.each(['APPLICATION', 'PIPELINE'])(
    'shows neutral missing %s feedback after evidence changes',
    async (scope) => {
      await renderReport(
        state({
          stale_reason: `${scope.toLowerCase()} evidence changed; rerun required`,
          job: {
            id: 'old-job',
            state: 'invalidated',
            uncertain: false,
            error: 'evidence changed; rerun required',
            completed_sections: 0,
            total_sections: 1,
          },
        }),
        { scope }
      );
      expect(screen.getByRole('status')).toHaveTextContent('No feedback yet');
      expect(screen.getByRole('status')).not.toHaveClass('text-yellow-bright');
      expect(
        screen.queryByText(
          /out of date|rerun required|saved information has changed/i
        )
      ).not.toBeInTheDocument();
      expect(requestButton()).toBeEnabled();
      expect(post).not.toHaveBeenCalled();
    }
  );

  it('shows Starting immediately and prevents duplicate clicks before acknowledgement', async () => {
    await renderReport(state());
    let resolve!: (value: unknown) => void;
    post.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    fireEvent.click(requestButton());
    expect(
      screen.queryByRole('button', { name: /: application feedback$/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Starting feedback…')).toBeVisible();
    expect(
      screen.getByRole('status').querySelector('.animate-spin')
    ).not.toBeNull();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    resolve({
      data: {
        id: 'job',
        intent_id: post.mock.calls[0][1].intent_id,
        state: 'queued',
        uncertain: false,
        error: null,
        completed_sections: 0,
        total_sections: 1,
      },
    });
  });

  it('does not present active provider uncertainty as a failed request', async () => {
    await renderReport(
      state({
        job: {
          id: 'job',
          state: 'analyzing',
          uncertain: true,
          error: null,
          completed_sections: 0,
          total_sections: 1,
        },
      })
    );
    expect(screen.getByText('Preparing feedback…')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /: application feedback$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Trying again may repeat work or charges/)
    ).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    [
      'pipeline scope or text configuration changed; rerun required',
      'Saved feedback uses different settings.',
      'text-fg1',
    ],
    [
      'pipeline evidence changed; rerun required',
      'Your saved information has changed.',
      'text-yellow-bright',
    ],
  ])(
    'distinguishes scope changes from actual evidence changes: %s',
    async (reason, message, color) => {
      await renderReport(
        state({
          stale_reason: reason,
          report: {
            run_at: '2026-09-28T10:00:00Z',
            provider: 'fixture',
            model: 'fixture',
            period: '7d',
            findings: [],
            sources: [],
            limitations: [],
            coverage: { sections: 1, sources: 1, characters: 10 },
          },
        }),
        { scope: 'PIPELINE' }
      );
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent(message);
      expect(status).toHaveClass(color);
      expect(post).not.toHaveBeenCalled();
    }
  );

  it('shows a saved takeaway and action without interpretation or evidence panels', async () => {
    await renderReport(
      state({
        report: {
          run_at: '2026-09-19T10:00:00Z',
          provider: 'openai',
          model: 'openai/synthetic-text',
          findings: [
            {
              observation: 'Recorded history shows one transition.',
              interpretation: 'A recorded association, not proof of a cause.',
              action: 'Keep recorded history current.',
              limitations: 'One application only.',
              citations: [
                { source_id: 'application:a1:company', quote: 'Acme' },
              ],
            },
          ],
          sources: [
            { id: 'application:a1:company', kind: 'application', text: 'Acme' },
          ],
          limitations: ['Small sample.'],
          coverage: { sections: 1, sources: 1, characters: 4 },
        },
      })
    );
    expect(screen.getByText(/Feedback ready/)).toBeVisible();
    expect(screen.getByLabelText('Saved feedback')).toBeVisible();
    expect(
      screen.getByText(/Recorded history shows one transition/i)
    ).toBeVisible();
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'Keep recorded history current.'
    );
    expect(
      screen.queryByText('A recorded association, not proof of a cause.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /Finding/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('About this feedback')).not.toBeInTheDocument();
    expect(screen.queryByText('Small sample.')).not.toBeInTheDocument();
    expect(screen.queryByText('One application only.')).not.toBeInTheDocument();
    expect(screen.queryByText('Supporting passage')).not.toBeInTheDocument();
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
  });

  it('keeps returned saved feedback after a failed update and drops it after source invalidation clears it', async () => {
    const saved = {
      run_at: '2026-01-01',
      provider: 'test',
      model: 'test',
      findings: [
        {
          action: 'Keep the saved advice',
          observation: 'A saved observation',
          interpretation: 'A cautious interpretation',
          limitations: 'Limited evidence',
          citations: [],
        },
      ],
      sources: [],
      limitations: [],
      coverage: { sections: 1, sources: 1, characters: 10 },
    };
    await renderReport(
      state({
        report: saved,
        job: {
          id: 'failed-job',
          state: 'failed',
          uncertain: false,
          error: 'Provider unavailable',
          completed_sections: 0,
          total_sections: 1,
        },
      })
    );
    expect(screen.getByText('Keep the saved advice')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your saved feedback is still available'
    );
    get.mockResolvedValue({
      data: state({ stale_reason: 'source removed', report: null }),
    });
    invalidateEvidenceQueries();
    await waitFor(() =>
      expect(
        screen.queryByText('Keep the saved advice')
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText(/No feedback yet/)).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows a safe provider failure cause directly without Request details', async () => {
    await renderReport(
      state({
        job: {
          id: 'timeout-job',
          state: 'failed',
          uncertain: true,
          error:
            'The report provider request timed out. Remote work may have occurred; explicit retry only.',
          completed_sections: 0,
          total_sections: 2,
        },
      })
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The report provider request timed out'
    );
    expect(screen.queryByText('Request details')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /: application feedback$/i })
    ).toHaveTextContent('Try again');
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps a sparse result to its saved action without empty topic panels', async () => {
    await renderReport(
      state({
        report: {
          run_at: '2026-01-01',
          provider: 'test',
          model: 'test',
          period: 'all',
          findings: [
            {
              topic: 'pipeline',
              action: 'Pipeline next step',
              observation: 'Recorded observation',
              interpretation: 'Qualified context',
              limitations: 'Limited evidence',
              citations: [],
            },
          ],
          sources: [],
          limitations: [],
          coverage: { sections: 1, sources: 1, characters: 10 },
        },
      }),
      { scope: 'PIPELINE' }
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'Pipeline next step'
    );
    expect(
      screen.queryByRole('region', { name: 'Activity Guidance' })
    ).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('does not retain a different target report while the new target is loading', async () => {
    const saved = {
      run_at: '2026-01-01',
      provider: 'test',
      model: 'test',
      findings: [
        {
          action: 'A-only advice',
          observation: 'A only',
          interpretation: 'A only',
          limitations: 'A only',
          citations: [],
        },
      ],
      sources: [],
      limitations: [],
      coverage: { sections: 1, sources: 1, characters: 10 },
    };
    get.mockResolvedValue({ data: state({ report: saved }) });
    const view = render(<ScopedReport {...props} />);
    await screen.findByText('A-only advice');
    let resolve!: (value: unknown) => void;
    get.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    view.rerender(
      <ScopedReport {...props} endpoint="/api/applications/a2/feedback" />
    );
    expect(screen.queryByText('A-only advice')).not.toBeInTheDocument();
    expect(screen.getByText('Loading saved feedback…')).toBeVisible();
    resolve({ data: state() });
    await screen.findByText(/No feedback yet/);
    expect(post).not.toHaveBeenCalled();
  });

  it('checks an unconfirmed request then reuses its original intent and payload on explicit retry', async () => {
    await renderReport(state());
    post.mockRejectedValueOnce(new Error('response lost'));
    fireEvent.click(requestButton());
    await screen.findByRole('button', {
      name: 'Check status: application feedback',
    });
    const first = post.mock.calls[0][1];
    get.mockResolvedValue({
      data: state({
        generation: 9,
        capability: {
          ...state().capability,
          available: false,
          configuration_revision: 'new-revision',
        },
      }),
    });
    invalidateEvidenceQueries();
    await screen.findByText(/New feedback is unavailable/);
    fireEvent.click(
      screen.getByRole('button', { name: 'Check status: application feedback' })
    );
    const retry = await screen.findByRole('button', {
      name: 'Retry request: application feedback',
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(retry).toBeDisabled();
    get.mockResolvedValue({
      data: state({
        generation: 9,
        capability: {
          ...state().capability,
          configuration_revision: 'new-revision',
        },
      }),
    });
    invalidateEvidenceQueries();
    await waitFor(() => expect(retry).toBeEnabled());
    post.mockResolvedValue({
      data: {
        id: 'accepted',
        intent_id: first.intent_id,
        state: 'queued',
        uncertain: false,
        error: null,
        completed_sections: 0,
        total_sections: 1,
      },
    });
    fireEvent.click(retry);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1]).toEqual(first);
    expect(first).toMatchObject({ generation: 0, config_revision: 'rev-1' });
  });

  it.each(['APPLICATION', 'PIPELINE'])(
    'keeps every %s action in saved order, including legacy and repeated wording',
    async (scope) => {
      const finding = (
        action: string,
        topic?: 'pipeline' | 'interview' | 'activity'
      ) => ({
        action,
        ...(scope === 'PIPELINE' ? { topic } : {}),
        observation: 'Recorded observation',
        interpretation: 'Qualified context',
        limitations: 'Limited evidence',
        citations: [],
      });
      await renderReport(
        state({
          report: {
            run_at: '2026-01-01',
            provider: 'test',
            model: 'test',
            period: 'all',
            findings: [
              {
                ...finding('Review the saved follow-up.', 'pipeline'),
                observation: 'Two applications are awaiting a reply.',
              },
              finding(
                'Practise explaining your own contribution.',
                'interview'
              ),
              finding('Compare the recorded sources.', 'pipeline'),
              finding('Record the next contact.', 'activity'),
              finding('Keep the next application step current.'),
              finding('Review the saved follow-up.'),
            ],
            sources: [],
            limitations: [],
            coverage: { sections: 1, sources: 1, characters: 10 },
          },
        }),
        { scope }
      );
      const saved = within(screen.getByLabelText('Saved feedback'));
      expect(saved.getAllByRole('list')).toHaveLength(1);
      const items = saved.getAllByRole('listitem');
      expect(items.map((item) => item.textContent)).toEqual([
        'Review the saved follow-up.',
        'Practise explaining your own contribution.',
        'Compare the recorded sources.',
        'Record the next contact.',
        'Keep the next application step current.',
        'Review the saved follow-up.',
      ]);
      for (const item of items) expect(item).toBeVisible();
      expect(
        saved.getAllByText('Two applications are awaiting a reply.')
      ).toHaveLength(1);
      expect(saved.queryByText('Recorded observation')).not.toBeInTheDocument();
      expect(saved.queryByText('Qualified context')).not.toBeInTheDocument();
      expect(saved.queryByRole('heading')).not.toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    }
  );

  it('opens a small help control without the removed explanation paragraph', async () => {
    await renderReport(
      state({
        report: {
          run_at: '2026-01-01',
          provider: 'test',
          model: 'test',
          findings: [],
          sources: [],
          limitations: [],
          coverage: { sections: 1, sources: 1, characters: 10 },
        },
      }),
      { scope: 'PIPELINE' }
    );
    expect(
      screen.queryByText(/Uses your saved information with the configured AI/)
    ).not.toBeInTheDocument();
    const help = screen.getByRole('button', {
      name: 'About application feedback',
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() => help.focus());
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent(/Charges may apply only when you request/);
    fireEvent.keyDown(help, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(help);

    fireEvent.mouseEnter(help.parentElement as HTMLElement);
    expect(await screen.findByRole('tooltip')).toBeVisible();
    fireEvent.keyDown(help, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(help);

    fireEvent.click(help);
    expect(await screen.findByRole('tooltip')).toBeVisible();
    fireEvent.click(help);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows application context, prior-AI provenance and conditional draft placeholders', async () => {
    await renderReport(
      state({
        report: {
          run_at: '2026-01-01',
          provider: 'fixture',
          model: 'mock',
          findings: [
            {
              observation:
                'The record is at Interviewing, but attendance is not recorded.',
              interpretation:
                'A schedule is not attendance. Check your own calendar and last message before contacting an employer.',
              action: 'Check your own records before choosing a branch.',
              limitations:
                'The last substantive message, reply date and prior follow-ups are not supplied.',
              citations: [
                {
                  source_id: 'round:r:interview_findings:0',
                  quote: 'Test coverage was not explained.',
                },
              ],
              coaching: {
                version: 1,
                kind: 'application',
                title: 'Resolve the stage from your own notes',
                context_citations: [0],
                branches: [
                  {
                    condition: 'If this is a practice record',
                    action: 'Keep it as practice. Do not contact an employer.',
                  },
                  {
                    condition: 'If the round was rescheduled',
                    action: 'Use only the confirmed new date.',
                  },
                ],
                draft: {
                  condition:
                    'Use only after confirmed attendance and a passed agreed reply date, with no later message or follow-up that changes the plan.',
                  text: 'Hello [contact name],\nCould you confirm the next step after our interview on [attendance date]?\nThank you, [your name]',
                },
              },
            },
          ],
          sources: [
            {
              id: 'round:r:interview_findings:0',
              kind: 'round',
              text: 'Test coverage was not explained.',
            },
          ],
          limitations: [],
          coverage: { sections: 1, sources: 1, characters: 100 },
        },
      })
    );
    expect(screen.getByText(/A schedule is not attendance/)).toBeVisible();
    expect(
      screen.getByText('Earlier AI feedback · not verified experience')
    ).toBeVisible();
    expect(screen.getByText('Test coverage was not explained.')).toBeVisible();
    expect(screen.getByText(/Keep it as practice/)).toBeVisible();
    expect(screen.getByText(/Hello \[contact name\]/)).toBeVisible();
    expect(
      screen.getByText(/Use only after confirmed attendance/)
    ).toBeVisible();
    expect(
      screen.getByText('Use only the confirmed new date.')
    ).not.toBeVisible();
    fireEvent.click(screen.getByText('If the round was rescheduled'));
    expect(screen.getByText('Use only the confirmed new date.')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it.each(['original', 'imported'])(
    'shows named pipeline records, unknown rounds and safe %s navigation',
    async (origin) => {
      const id = '11111111-1111-4111-8111-111111111111';
      const record = JSON.stringify({
        application_id: id,
        company: 'Copper Meadow',
        role: 'Data Engineer',
        applied_at: '2026-09-18',
        source: null,
        current_stage: 'applied',
        stage_at_report_date: 'applied',
        history_incomplete: true,
      });
      const round = JSON.stringify({
        application_id: id,
        round_type: 'Technical',
        scheduled_at: '2026-09-25 13:00:00+00:00',
        completed_at: null,
        outcome: null,
      });
      await renderReport(
        state({
          period: '7d',
          report: {
            run_at: '2026-09-28',
            provider: 'fixture',
            model: 'mock',
            fingerprint: origin === 'original' ? 'saved-proof' : '',
            period: '30d',
            as_of: '2026-09-28T17:24:00Z',
            time_zone: 'UTC',
            findings: [
              {
                observation: 'One Applied record has an unknown round outcome.',
                interpretation:
                  'An applied date is not last contact. An unknown round outcome is not a failed round.',
                action:
                  'Check the actual timeline before considering a follow-up.',
                limitations: 'No messages or agreed reply dates are supplied.',
                citations: [
                  {
                    source_id: 'pipeline:recorded_approaches:0',
                    quote: record,
                  },
                  { source_id: 'pipeline:rounds:0', quote: round },
                  {
                    source_id: 'pipeline:metrics:0',
                    quote: '"total_applications":13',
                  },
                ],
                coaching: {
                  version: 1,
                  kind: 'pipeline',
                  title: 'Check the recorded timeline',
                  records: [
                    {
                      record_citation: 0,
                      round_citations: [1],
                      condition:
                        'Check attendance and any newer messages first.',
                      action:
                        'Keep waiting if the agreed reply window is open.',
                    },
                  ],
                },
              },
            ],
            sources: [
              {
                id: 'pipeline:recorded_approaches:0',
                kind: 'pipeline_record',
                text: record,
              },
              { id: 'pipeline:rounds:0', kind: 'pipeline_record', text: round },
              {
                id: 'pipeline:metrics:0',
                kind: 'pipeline_metrics',
                text: JSON.stringify({
                  total_applications: 13,
                  responded: 9,
                  response_rate: 69.2,
                  interviews: 3,
                  interview_rate: 23.1,
                  offers: null,
                  offer_rate: null,
                  scope: {
                    cohort_start: '2026-08-30',
                    cohort_end: '2026-09-28',
                    as_of: '2026-09-28 17:24:00+00:00',
                    time_zone: 'UTC',
                  },
                }),
              },
            ],
            limitations: [],
            coverage: { sections: 1, sources: 3, characters: 1000 },
          },
        }),
        { scope: 'PIPELINE' }
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Saved feedback is for Last 30 days.'
      );
      expect(
        screen.queryByText(
          /Applied-date cohort|saved snapshot|original cohort|Charts:/
        )
      ).not.toBeInTheDocument();
      expect(screen.getByText('69.2%')).toBeVisible();
      expect(screen.getByText('Rate unavailable')).toBeVisible();
      expect(screen.getByText(/Applied 2026-09-18/)).toBeVisible();
      expect(screen.getByText(/Source: Not recorded/)).toBeVisible();
      expect(screen.getByText(/Technical · Scheduled/)).toHaveTextContent(
        'Completed: Not recorded · Outcome: Not recorded'
      );
      if (origin === 'original')
        expect(
          screen.getByRole('link', { name: 'Copper Meadow' })
        ).toHaveAttribute('href', `/applications/${id}`);
      else
        expect(
          screen.queryByRole('link', { name: 'Copper Meadow' })
        ).not.toBeInTheDocument();
      expect(screen.queryByText(record)).not.toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      'feedback prompt changed; update explicitly',
      'Feedback instructions changed.',
    ],
    [
      'feedback prompt version unknown; update explicitly',
      'Saved feedback may use older instructions.',
    ],
  ])(
    'explains %s without changing saved actions or starting work',
    async (reason, message) => {
      await renderReport(
        state({
          stale_reason: reason,
          report: {
            run_at: '2026-01-01',
            provider: 'test',
            model: 'test',
            findings: [
              {
                observation: 'Saved situation',
                interpretation: 'Saved explanation',
                action: 'Keep this saved action.',
                limitations: 'Saved limit',
                citations: [],
              },
            ],
            sources: [],
            limitations: [],
            coverage: { sections: 1, sources: 1, characters: 10 },
          },
        })
      );
      expect(screen.getByRole('status')).toHaveTextContent(message);
      expect(screen.getByText('Keep this saved action.')).toBeVisible();
      expect(
        screen.queryByText(/Feedback ready|Your saved information has changed/)
      ).not.toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    }
  );

  it('shows the advice of a pipeline finding without record cards', async () => {
    await renderReport(
      state({
        report: {
          run_at: '2026-01-01',
          provider: 'test',
          model: 'test',
          findings: [
            {
              observation: 'Recorded pattern',
              interpretation: 'Qualified explanation',
              action: 'Check the available records.',
              limitations: 'Partial section',
              citations: [],
              coaching_unavailable: 'complete_record_unavailable',
            },
          ],
          sources: [],
          limitations: [],
          coverage: { sections: 1, sources: 1, characters: 10 },
        },
      }),
      { scope: 'PIPELINE' }
    );
    expect(
      screen.queryByText(/Record-specific coaching is unavailable/)
    ).not.toBeInTheDocument();
    expect(screen.getByText('Check the available records.')).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it('surfaces a load failure without requesting work', async () => {
    get.mockRejectedValue(new Error('offline'));
    render(<ScopedReport {...props} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Cannot load feedback/i
      )
    );
    expect(post).not.toHaveBeenCalled();
  });
});
