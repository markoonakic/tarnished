import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/react';
import i18n from '@/lib/i18n';
import type { FeedbackState } from '../hooks/useFeedback';
import FeedbackFindings from './FeedbackFindings';

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

it('keeps Better answer safety guidance inside its HelpTip', () => {
  render(
    <FeedbackFindings
      scope="interview"
      report={{
        ...report,
        findings: [
          {
            observation: 'Observed',
            interpretation: 'Review',
            action: 'Practice',
            limitations: '',
            citations: [],
            coaching: {
              version: 1,
              kind: 'interview',
              title: 'Finding',
              answer_citation: 0,
              better_answer: 'Proposed answer',
            },
          },
        ],
      }}
    />
  );
  expect(screen.getByText('Proposed wording')).toBeVisible();
  expect(
    screen.queryByText('Check the facts before using it.')
  ).not.toBeInTheDocument();
  fireEvent.focus(screen.getByRole('button', { name: 'Proposed wording' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Check the facts before using it.'
  );
});

it.each(['direct', 'snapshot', 'custom'] as const)(
  'localizes saved round identity via %s without changing quotes',
  async (mode) => {
    await i18n.changeLanguage('sr-Latn');
    const round = {
      application_id: 'app',
      round_type: 'Technical',
      scheduled_at: null,
      completed_at: null,
      outcome: null,
      ...(mode === 'direct'
        ? { round_builtin_key: 'technical' }
        : mode === 'custom'
          ? { round_builtin_key: null }
          : {}),
    };
    const quote = JSON.stringify(round);
    render(
      <FeedbackFindings
        scope="pipeline"
        report={{
          ...report,
          evidence_snapshot: {
            metrics: { rounds: [{ ...round, round_builtin_key: 'technical' }] },
          },
          findings: [
            {
              observation: 'Observed',
              interpretation: 'Review',
              action: 'Practice',
              limitations: '',
              citations: [
                {
                  source_id: 'record',
                  quote: JSON.stringify({
                    application_id: 'app',
                    company: 'North',
                  }),
                },
                { source_id: 'round', quote },
              ],
              coaching: {
                version: 1,
                kind: 'pipeline',
                title: 'Finding',
                records: [
                  {
                    record_citation: 0,
                    round_citations: [1],
                    condition: 'Check',
                    action: 'Review',
                  },
                ],
              },
            },
          ],
        }}
      />
    );
    expect(
      screen.getByText(
        new RegExp(mode === 'custom' ? '^Technical' : '^Tehnički intervju')
      )
    ).toBeVisible();
    expect(quote).toBe(JSON.stringify(round));
  }
);
const report: NonNullable<FeedbackState['report']> = {
  run_at: '2026-09-28T10:00:00Z',
  provider: 'fixture',
  model: 'fixture',
  findings: [],
  sources: [],
  limitations: [],
  coverage: { sections: 1, sources: 1, characters: 100 },
};

it.each([
  ['"2026-09-25 07:50:00"', '2026-09-25T07:50:00Z', 'UTC'],
  ['"2026-09-25T07:50:00Z"', '2026-09-25T07:50:00Z', 'Europe/Belgrade'],
])(
  'formats a saved timestamp without quotes and keeps its exact original title: %s',
  (quote, instant, zone) => {
    render(
      <FeedbackFindings
        scope="application"
        report={{
          ...report,
          time_zone: zone,
          sources: [
            { id: 'round:r:completed_at:0', kind: 'round', text: quote },
          ],
          findings: [
            {
              observation: 'Recorded completion',
              interpretation: 'Check your records',
              action: 'Check attendance',
              limitations: 'Recorded only',
              citations: [{ source_id: 'round:r:completed_at:0', quote }],
              coaching: {
                version: 1,
                kind: 'application',
                title: 'Completion',
                context_citations: [0],
                branches: [],
              },
            },
          ],
        }}
      />
    );
    const passage = screen.getByTitle(quote);
    expect(passage).toHaveTextContent(
      new Date(instant).toLocaleString(undefined, {
        timeZone: zone,
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    );
    expect(passage.textContent).not.toContain('"');
    expect(screen.getByText('Round completed')).toBeVisible();
  }
);

it.each([
  '"The date 2026-09-25 is provisional."',
  '"2026-02-30 07:50:00"',
  '"2026-09-25 27:50:00"',
])(
  'does not change prose or invalid dates, or original structured stage data: %s',
  (quote) => {
    const saved = JSON.stringify({
      company: 'Copper Meadow',
      role: 'Engineer',
      current_stage: 'applied',
      stage_at_report_date: 'rejected',
    });
    const value = {
      ...report,
      findings: [
        {
          observation: 'Recorded stages',
          interpretation: 'Check your records',
          action: 'Review',
          limitations: 'Recorded only',
          citations: [{ source_id: 'pipeline:record:0', quote: saved }],
          coaching: {
            version: 1 as const,
            kind: 'pipeline' as const,
            title: 'Record',
            records: [
              { record_citation: 0, condition: 'Check', action: 'Review' },
            ],
          },
        },
      ],
    };
    render(<FeedbackFindings report={value} scope="pipeline" />);
    expect(screen.getByText(/Current stage: Applied/)).toBeVisible();
    expect(screen.getByText('Stage at report date: Rejected')).toBeVisible();
    expect(value.findings[0].citations[0].quote).toBe(saved);
    cleanup();
    render(
      <FeedbackFindings
        scope="application"
        report={{
          ...report,
          findings: [
            {
              observation: 'Note',
              interpretation: 'Check',
              action: 'Review',
              limitations: 'Only a note',
              citations: [{ source_id: 'note', quote }],
              coaching: {
                version: 1,
                kind: 'application',
                title: 'Note',
                context_citations: [0],
                branches: [],
              },
            },
          ],
        }}
      />
    );
    expect(screen.getByText(quote)).toBeVisible();
  }
);
