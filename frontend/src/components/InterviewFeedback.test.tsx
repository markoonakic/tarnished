import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { focusManager } from '@tanstack/react-query';
import i18n, { t } from '@/lib/i18n';
import type { InternalAxiosRequestConfig } from 'axios';
import api from '../lib/api';
import type { Round } from '../lib/types';
import InterviewFeedback, { type InterviewState } from './InterviewFeedback';
import { queryClient } from '../lib/queryClient';
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));

const original = api.defaults.adapter;
let requests: InternalAxiosRequestConfig[];
let state: InterviewState;
const round = { id: 'round', media: [] } as unknown as Round;
beforeEach(() => {
  queryClient.clear();
  requests = [];
  state = {
    generation: 2,
    report: null,
    stale_reason: null,
    job: null,
    capability: {
      available: true,
      provider: 'openai',
      model: 'synthetic',
      configuration_revision: 'revision',
      input_disclosure: 'Saved evidence only; drafts excluded',
      external_processing: 'External text service disclosure',
      message: 'Configured is not verified',
    },
  };
  api.defaults.adapter = async (config) => {
    requests.push(config);
    if (config.method === 'post') {
      state = {
        ...state,
        job: {
          id: 'new-job',
          intent_id: JSON.parse(config.data).intent_id,
          state: 'queued',
          uncertain: false,
          error: null,
          completed_sections: 0,
          total_sections: 1,
        },
      };
      return {
        data: state.job,
        status: 202,
        statusText: 'Accepted',
        headers: {},
        config,
      };
    }
    return {
      data: state,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
});
afterEach(async () => {
  await i18n.changeLanguage('en');
  cleanup();
  queryClient.clear();
  api.defaults.adapter = original;
  focusManager.setFocused(undefined);
  vi.restoreAllMocks();
});

it.each(['en', 'sr-Latn'])(
  'keeps empty feedback instructions in its help tip in %s',
  async (language) => {
    await i18n.changeLanguage(language);
    render(<InterviewFeedback round={round} />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        t('No feedback yet.')
      )
    );
    const copy = t(
      'Save a transcript and identify your answers as Candidate before requesting personal feedback.'
    );
    expect(screen.queryByText(copy)).not.toBeInTheDocument();
    fireEvent.focus(
      screen.getByRole('button', { name: t('About interview feedback') })
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(copy);
    expect(requests.every((request) => request.method === 'get')).toBe(true);
  }
);

it('translates the Serbian request accessible name without starting feedback', async () => {
  await i18n.changeLanguage('sr-Latn');
  render(<InterviewFeedback round={round} />);
  expect(
    await screen.findByRole(
      'button',
      { name: 'Zatraži analizu: analiza intervjua' },
      { timeout: 2500 }
    )
  ).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: /interview feedback/ })
  ).not.toBeInTheDocument();
  expect(requests.every((request) => request.method === 'get')).toBe(true);
});

it('InterviewFeedback discloses inputs, sends only explicit intent and keeps saved findings without evidence panels', async () => {
  const open = vi.fn();
  render(<InterviewFeedback round={round} onClose={open} />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Get feedback: interview feedback' })
    ).toBeEnabled()
  );
  expect(
    screen.queryByText(/Uses your transcript and job details/)
  ).not.toBeInTheDocument();
  fireEvent.focus(
    screen.getByRole('button', { name: 'About interview feedback' })
  );
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    /Uses your transcript and job details/
  );
  expect(
    screen.queryByText('Configured is not verified')
  ).not.toBeInTheDocument();
  expect(requests.every((r) => r.method === 'get')).toBe(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Get feedback: interview feedback' })
  );
  await waitFor(() =>
    expect(requests.filter((r) => r.method === 'post')).toHaveLength(1)
  );
  expect(
    JSON.parse(requests.find((r) => r.method === 'post')!.data)
  ).toMatchObject({ generation: 2, config_revision: 'revision' });
  state = {
    ...state,
    stale_reason: 'evidence changed; rerun required',
    job: { ...state.job!, state: 'complete' },
    report: {
      run_at: '2026-01-01',
      provider: 'openai',
      model: 'synthetic',
      coverage: { sections: 1, sources: 2, characters: 60 },
      limitations: ['Unknown employer motive'],
      sources: [
        {
          id: 'transcript:segment:0',
          segment_id: 'segment',
          text: 'Literal candidate answer',
          kind: 'transcript',
          role: 'candidate',
        },
      ],
      findings: [
        {
          observation: 'A vague answer',
          interpretation: 'May need a concrete example',
          action:
            'Practise the incident answer aloud: describe your own change, then explain how you checked the result.',
          limitations: 'No invented achievement',
          citations: [
            {
              source_id: 'transcript:segment:0',
              quote: 'Literal candidate answer',
            },
          ],
        },
        ...[
          'Name the trade-off you considered before you chose the fix.',
          'Explain what you would check first if the incident happened again.',
        ].map((action) => ({
          action,
          observation: 'Another saved observation',
          interpretation: 'Another qualified interpretation',
          limitations: 'Partial transcript',
          citations: [],
        })),
      ],
    },
  };
  await screen.findByText(
    'Practise the incident answer aloud: describe your own change, then explain how you checked the result.',
    {},
    { timeout: 2500 }
  );
  expect(
    screen.getAllByRole('listitem').map((item) => item.textContent)
  ).toEqual([
    'Practise the incident answer aloud: describe your own change, then explain how you checked the result.',
    'Name the trade-off you considered before you chose the fix.',
    'Explain what you would check first if the incident happened again.',
  ]);
  expect(screen.queryByText('A vague answer')).not.toBeInTheDocument();
  expect(
    screen.queryByText('May need a concrete example')
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: /Finding/ })
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Your saved information has changed/)
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Saved interview feedback')).toBeVisible();
  expect(screen.queryByText('Your answer')).not.toBeInTheDocument();
  expect(screen.queryByText('About this feedback')).not.toBeInTheDocument();
  expect(screen.queryByText('No invented achievement')).not.toBeInTheDocument();
  expect(screen.queryByText('Unknown employer motive')).not.toBeInTheDocument();
  expect(screen.queryByText('Open transcript passage')).not.toBeInTheDocument();
  expect(open).not.toHaveBeenCalled();
  expect(requests.filter((r) => r.method === 'post')).toHaveLength(1);
});

it('shows grounded answer review, a fact-limited rewrite and practice without a write', async () => {
  const finding = {
    observation: 'The answer does not state the second trace result.',
    interpretation:
      'Adding an index is an action, not evidence of a measured speed-up.',
    action:
      'Rehearse what the second trace showed. If you cannot recall it, say so.',
    limitations: 'Before-and-after latency was not recorded.',
    citations: [
      {
        source_id: 'answer:0',
        quote: 'I added an index and checked the trace again.',
      },
      {
        source_id: 'requirement:0',
        quote: 'Explain diagnosis using measurements.',
      },
    ],
    coaching: {
      version: 1 as const,
      kind: 'interview' as const,
      title: 'Explain what the next check showed',
      question: {
        source_id: 'question:0',
        quote: 'How did you check the change?',
      },
      answer_citation: 0,
      better_answer:
        'I added an index, then checked the trace again. I cannot give a measured speed-up.',
    },
  };
  state.report = {
    run_at: '2026-01-01',
    provider: 'fixture',
    model: 'mock',
    findings: [
      finding,
      {
        ...finding,
        coaching: { ...finding.coaching, title: 'Keep test coverage separate' },
      },
      {
        ...finding,
        coaching: undefined,
        action: 'Keep this legacy action unchanged.',
      },
    ],
    sources: [
      {
        id: 'answer:0',
        kind: 'transcript',
        role: 'candidate',
        text: finding.citations[0].quote,
      },
      {
        id: 'question:0',
        kind: 'transcript',
        role: 'interviewer',
        text: 'How did you check the change?',
      },
      {
        id: 'requirement:0',
        kind: 'requirement',
        text: finding.citations[1].quote,
      },
    ],
    limitations: [],
    coverage: { sections: 2, sources: 3, characters: 180 },
  };
  render(<InterviewFeedback round={round} />);
  const first = within(
    await screen.findByRole('article', {
      name: 'Explain what the next check showed',
    })
  );
  expect(
    first.getByText('I added an index and checked the trace again.')
  ).toBeVisible();
  expect(first.getByText(/How did you check the change/)).toBeVisible();
  expect(first.getByText(finding.interpretation)).toBeVisible();
  expect(first.getByText(finding.coaching.better_answer)).toBeVisible();
  expect(first.getByText(finding.action)).toBeVisible();
  const second = within(
    screen.getByRole('article', { name: 'Keep test coverage separate' })
  );
  expect(second.getByText(finding.coaching.better_answer)).not.toBeVisible();
  for (const label of ['Better answer', 'Practise this', 'Role requirement'])
    expect(first.getByText(label).closest('details')).toHaveClass(
      '[&>summary:hover]:bg-bg2',
      '[&>summary:hover]:text-fg0'
    );
  fireEvent.click(second.getByText('Better answer'));
  expect(second.getByText(finding.coaching.better_answer)).toBeVisible();
  fireEvent.click(first.getByText('Role requirement'));
  expect(
    first.getByText('Explain diagnosis using measurements.')
  ).toBeVisible();
  expect(screen.getByText('Keep this legacy action unchanged.')).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(requests.every((r) => r.method === 'get')).toBe(true);
});

it('InterviewFeedback presents uncertain interruption without automatic replay', async () => {
  state.job = {
    id: 'job',
    state: 'interrupted',
    uncertain: true,
    error: 'Explicit retry only',
    completed_sections: 0,
    total_sections: 2,
  };
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<InterviewFeedback round={round} onClose={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Trying again may repeat work or charges'
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Try again: interview feedback' })
  );
  expect(requests.every((r) => r.method === 'get')).toBe(true);
});

it('keeps saved-report update and failed retry as explicit primary actions', async () => {
  state.report = {
    run_at: '2026-01-01',
    provider: 'mock',
    model: 'mock',
    findings: [
      {
        observation: 'Saved observation',
        interpretation: 'Saved explanation',
        action: 'Keep this saved action.',
        limitations: 'Mock only',
        citations: [],
      },
    ],
    sources: [],
    coverage: { sections: 1, sources: 0, characters: 0 },
    limitations: [],
  };
  const view = render(<InterviewFeedback round={round} />);
  const update = await screen.findByRole('button', {
    name: 'Update feedback: interview feedback',
  });
  expect(update).toHaveClass(
    'feedback-primary',
    'bg-accent',
    'text-bg0',
    'hover:bg-accent-bright'
  );
  update.focus();
  expect(update).toHaveFocus();
  expect(screen.getByText('Keep this saved action.')).toBeVisible();
  expect(requests.every((r) => r.method === 'get')).toBe(true);
  view.unmount();
  queryClient.clear();
  state.job = {
    id: 'failed-job',
    intent_id: 'previous-intent',
    state: 'failed',
    uncertain: false,
    error: 'The report provider rejected the request (4xx).',
    completed_sections: 0,
    total_sections: 1,
  };
  render(<InterviewFeedback round={round} />);
  const retry = await screen.findByRole('button', {
    name: 'Try again: interview feedback',
  });
  expect(retry).toHaveClass(
    'feedback-primary',
    'bg-accent',
    'text-bg0',
    'hover:bg-accent-bright'
  );
  expect(screen.getByText('Keep this saved action.')).toBeVisible();
  expect(requests.every((r) => r.method === 'get')).toBe(true);
  fireEvent.click(retry);
  await waitFor(() =>
    expect(requests.filter((r) => r.method === 'post')).toHaveLength(1)
  );
  expect(
    screen.queryByRole('button', { name: /^(Starting|Waiting)/ })
  ).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    /Starting feedback|Waiting to start/
  );
  expect(screen.getByText('Keep this saved action.')).toBeVisible();
});

it('keeps interview progress short while an older stale result is shown', async () => {
  state.stale_reason = 'evidence changed; rerun required';
  state.job = {
    id: 'job',
    state: 'analyzing',
    uncertain: false,
    error: null,
    completed_sections: 0,
    total_sections: 1,
  };
  state.report = {
    run_at: '2026-10-04',
    provider: 'fixture',
    model: 'test',
    findings: [],
    sources: [],
    limitations: [],
    coverage: { sections: 1, sources: 1, characters: 10 },
  };
  render(<InterviewFeedback round={round} />);
  await screen.findByText('Preparing feedback…');
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByText('Showing saved feedback.')).toBeVisible();
  expect(
    screen.queryByText(
      /saved information has changed|keep using|Saved feedback from/
    )
  ).not.toBeInTheDocument();
});

it('updates both round panels when a queued job finishes while another tab has focus', async () => {
  const states: Record<string, InterviewState> = {
    first: structuredClone(state),
    second: structuredClone(state),
  };
  api.defaults.adapter = async (config) => {
    requests.push(config);
    const target = config.url?.includes('/first/') ? 'first' : 'second';
    if (config.method === 'post') {
      states[target] = {
        ...states[target],
        job: {
          id: `${target}-job`,
          intent_id: JSON.parse(config.data).intent_id,
          state: target === 'first' ? 'analyzing' : 'queued',
          uncertain: false,
          error: null,
          completed_sections: 0,
          total_sections: 1,
        },
      };
    }
    return {
      data: config.method === 'post' ? states[target].job : states[target],
      status: config.method === 'post' ? 202 : 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  render(
    <>
      <div data-testid="first-panel">
        <InterviewFeedback round={{ ...round, id: 'first' }} />
      </div>
      <div data-testid="second-panel">
        <InterviewFeedback round={{ ...round, id: 'second' }} />
      </div>
    </>
  );
  const first = within(screen.getByTestId('first-panel'));
  const second = within(screen.getByTestId('second-panel'));
  for (const panel of [first, second]) {
    const button = await panel.findByRole('button', {
      name: 'Get feedback: interview feedback',
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
  }
  await first.findByText('Preparing feedback…');
  await second.findByText('Waiting to start…');
  focusManager.setFocused(false);
  function complete(target: string, action: string) {
    states[target] = {
      ...states[target],
      job: { ...states[target].job!, state: 'complete', completed_sections: 1 },
      report: {
        run_at: '2026-10-05T10:00:00Z',
        provider: 'fixture',
        model: 'fixture',
        findings: [
          {
            observation: 'Saved fact',
            interpretation: 'Qualified advice',
            action,
            limitations: 'Partial record',
            citations: [],
          },
        ],
        sources: [],
        limitations: [],
        coverage: { sections: 1, sources: 0, characters: 0 },
      },
    };
  }
  complete('first', 'First round advice.');
  states.second = {
    ...states.second,
    job: { ...states.second.job!, state: 'analyzing' },
  };
  await first.findByText('First round advice.', {}, { timeout: 2500 });
  await second.findByText('Preparing feedback…', {}, { timeout: 2500 });
  complete('second', 'Second round advice.');
  await second.findByText('Second round advice.', {}, { timeout: 2500 });
  expect(first.getByText('First round advice.')).toBeVisible();
  expect(first.queryByText('Second round advice.')).not.toBeInTheDocument();
  expect(second.queryByText('Waiting to start…')).not.toBeInTheDocument();
  expect(requests.filter((request) => request.method === 'post')).toHaveLength(
    2
  );
});

it('shows no feedback yet, not a stale warning, for a transcript with no saved report', async () => {
  state.stale_reason = 'evidence changed; rerun required';
  state.job = {
    id: 'old-job',
    state: 'invalidated',
    uncertain: false,
    error: 'evidence changed; rerun required',
    completed_sections: 0,
    total_sections: 1,
  };
  render(
    <InterviewFeedback round={{ ...round, has_current_transcript: true }} />
  );
  await screen.findByRole('button', {
    name: 'Get feedback: interview feedback',
  });
  expect(screen.getByRole('status')).toHaveTextContent('No feedback yet');
  expect(screen.getByRole('status')).not.toHaveClass('text-yellow-bright');
  expect(
    screen.queryByText(
      /saved information has changed|rerun required|out of date/i
    )
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Get feedback: interview feedback' })
  ).toBeEnabled();
  expect(requests.every((r) => r.method === 'get')).toBe(true);
});
