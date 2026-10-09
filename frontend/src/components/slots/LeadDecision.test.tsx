import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import i18n, { t } from '@/lib/i18n';
import type { JobLead } from '@/lib/types';
import { apiV030, type Lead } from '@/lib/apiV030';
import LeadDecision from './LeadDecision';

vi.mock('@/lib/apiV030', () => ({ apiV030: { updateLead: vi.fn() } }));
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

it.each(['en', 'sr-Latn'])(
  'disables converted decisions and explains why in %s',
  async (language) => {
    await i18n.changeLanguage(language);
    const lead = {
      id: 'lead',
      revision: 3,
      decision: 'interesting',
      converted_to_application_id: 'app',
    } as JobLead;
    render(<LeadDecision lead={lead} />);
    for (const decision of ['interesting', 'rejected', 'archived']) {
      const button = screen.getByRole('radio', {
        name: t('records.decision.' + decision),
      });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    const reset = screen.getByRole('button', {
      name: t('records.resetDecision'),
    });
    expect(reset).toBeDisabled();
    fireEvent.click(reset);
    expect(apiV030.updateLead).not.toHaveBeenCalled();
    expect(
      screen.queryByText(t('records.convertedDecision'))
    ).not.toBeInTheDocument();
    fireEvent.focus(
      screen.getByRole('button', { name: t('records.decisionHelp') })
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      t('records.convertedDecision')
    );
  }
);

it('saves an unconverted decision with its revision', async () => {
  vi.mocked(apiV030.updateLead).mockResolvedValue({} as Lead);
  const updated = vi.fn();
  render(
    <LeadDecision
      lead={
        {
          id: 'lead',
          revision: 3,
          decision: null,
          converted_to_application_id: null,
        } as JobLead
      }
      onUpdated={updated}
    />
  );
  const button = screen.getByRole('radio', { name: 'Rejected' });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(updated).toHaveBeenCalledOnce());
  expect(apiV030.updateLead).toHaveBeenCalledExactlyOnceWith('lead', {
    decision: 'rejected',
    expected_revision: 3,
  });
});
