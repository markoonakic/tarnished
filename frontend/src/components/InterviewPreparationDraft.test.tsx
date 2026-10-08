import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import type { Interview } from '@/lib/apiV030';
import InterviewPreparationDraft from './InterviewPreparationDraft';
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post },
  withAxiosTimeZoneHeaders: () => ({}),
}));
const interview = {
  id: 'round-1',
  application_id: 'app-1',
  revision: 5,
} as Interview;
let saved: Record<string, unknown> | null;
let client: QueryClient;
let allow: boolean;
beforeEach(() => {
  void i18n.changeLanguage('en');
  saved = null;
  allow = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  get.mockImplementation(async () => ({
    data: {
      analysis: saved,
      requirements: allow ? [{}] : [],
      profile: allow ? [{}] : [],
    },
  }));
  post.mockImplementation(async (url) => {
    if (url.endsWith('/run'))
      saved = {
        id: 'analysis-1',
        revision: 2,
        state: 'complete',
        review_state: 'ready',
        stale: false,
        draft: {
          review_topics: [
            { id: 'item-1', text: 'Practice grouping by month', evidence: [] },
          ],
          company_questions: [
            { id: 'item-2', text: 'How is code reviewed?', evidence: [] },
          ],
        },
      };
    if (url.endsWith('/apply')) saved = { ...saved, review_state: 'saved' };
    return { data: saved ?? { id: 'analysis-1', revision: 0 } };
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function show() {
  const onSaved = vi.fn(async () => {});
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <InterviewPreparationDraft interview={interview} onSaved={onSaved} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return onSaved;
}
it('only reads on open; explicit run shows selectable suggestions and saves selected IDs with both revisions', async () => {
  const onSaved = show();
  const run = screen.getByRole('button', { name: 'Draft with AI' });
  await waitFor(() => expect(run).toBeEnabled());
  expect(post).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(run);
  const select = await screen.findByRole('checkbox', {
    name: 'Practice grouping by month',
  });
  expect(screen.getByText('Draft — not saved')).toBeVisible();
  expect(post).toHaveBeenCalledTimes(2);
  fireEvent.click(select);
  fireEvent.click(screen.getByRole('button', { name: 'Save selected (1)' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(post).toHaveBeenLastCalledWith('/api/job-analyses/analysis-1/apply', {
    expected_revision: 2,
    target_revision: 5,
    selected_ids: ['item-1'],
  });
});
it('requires confirmed requirements and allowed profile items before a run', async () => {
  allow = false;
  show();
  await waitFor(() => expect(get).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Draft with AI' })).toBeDisabled();
  expect(post).not.toHaveBeenCalled();
});
it('does not automatically repeat an uncertain request', async () => {
  post.mockRejectedValue(new Error('Connection lost'));
  show();
  const run = screen.getByRole('button', { name: 'Draft with AI' });
  await waitFor(() => expect(run).toBeEnabled());
  fireEvent.click(run);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The request could not be completed'
  );
  expect(post).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
  await waitFor(() => expect(run).toBeEnabled());
  expect(post).toHaveBeenCalledOnce();
});
