import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import InterviewDetail from './InterviewDetail';

const { interview, updateInterview, preferences } = vi.hoisted(() => ({
  interview: vi.fn(),
  updateInterview: vi.fn(),
  preferences: { time_zone_mode: 'manual', time_zone: 'UTC' },
}));
vi.mock('@/lib/apiV030', () => ({ apiV030: { interview, updateInterview } }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    data: preferences,
  }),
}));
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/TargetReminders', () => ({ default: () => null }));
vi.mock('@/components/NotesPanel', () => ({ default: () => null }));
vi.mock('@/components/InterviewRecording', () => ({ default: () => null }));
vi.mock('@/components/InterviewParticipants', () => ({ default: () => null }));
vi.mock('@/components/InterviewPreparationDraft', () => ({
  default: () => null,
}));

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.resetAllMocks();
  preferences.time_zone = 'UTC';
  interview.mockResolvedValue({
    id: 'round',
    revision: 1,
    application_id: 'app',
    company: 'River',
    job_title: 'Engineer',
    round_type: { name: 'Technical', builtin_key: 'technical' },
    questions_answers: [{ question: 'Saved question', answer: 'Saved answer' }],
    contact_ids: [],
  });
  updateInterview.mockResolvedValue({ revision: 2 });
});
afterEach(cleanup);

function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={['/interviews/round']}>
        <Routes>
          <Route path="/interviews/:id" element={<InterviewDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
async function editor() {
  show();
  await screen.findByRole('heading', { name: 'Technical' });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  return screen.getByLabelText('Question');
}

it.each(['', '   '])(
  'keeps an existing answer when its question is %j',
  async (question) => {
    const field = await editor();
    fireEvent.change(field, { target: { value: question } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Enter a question or delete the answer.')
    ).toBeVisible();
    expect(screen.getByLabelText('My answer')).toHaveValue('Saved answer');
    expect(updateInterview).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'Corrected question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateInterview).toHaveBeenCalledWith(
        'round',
        expect.objectContaining({
          questions_answers: [
            { question: 'Corrected question', answer: 'Saved answer' },
          ],
        })
      )
    );
  }
);

it('keeps a new answer without a question and supports explicit row deletion', async () => {
  interview.mockResolvedValue({
    id: 'round',
    revision: 1,
    application_id: 'app',
    company: 'River',
    round_type: { name: 'Technical' },
    questions_answers: [],
  });
  await editor();
  fireEvent.change(screen.getByLabelText('My answer'), {
    target: { value: 'New answer' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(
    await screen.findByText('Enter a question or delete the answer.')
  ).toBeVisible();
  expect(updateInterview).not.toHaveBeenCalled();
  const row = screen.getByLabelText('My answer').parentElement!;
  fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(updateInterview).toHaveBeenCalledWith(
      'round',
      expect.objectContaining({ questions_answers: [] })
    )
  );
});

it('uses a separate field surface inside the question row', async () => {
  const question = await editor();
  expect(question).toHaveClass('bg-bg1');
  expect(screen.getByLabelText('My answer')).toHaveClass('bg-bg1');
  expect(question.parentElement).toHaveClass('bg-bg2');
  expect(question).not.toHaveClass('bg-bg2');
});

it.each([false, true])(
  'pins deadline interpretation to the editor zone (changed date: %s)',
  async (changeDate) => {
    preferences.time_zone = 'Europe/Belgrade';
    interview.mockResolvedValue({
      id: 'round',
      revision: 1,
      application_id: 'app',
      company: 'River',
      round_type: { name: 'Take-home', builtin_key: 'take_home' },
      task_description: 'Saved description',
      task_deadline: '2027-07-19T14:20:00Z',
    });
    show();
    await screen.findByRole('heading', { name: 'Take-home' });
    const task = screen.getByText('Take-home task').closest('section')!;
    fireEvent.click(
      within(task as HTMLElement).getByRole('button', { name: 'Edit' })
    );
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Changed description' },
    });
    const deadline = screen.getByLabelText('Task deadline');
    expect(deadline).toHaveValue('2027-07-19T16:20');
    preferences.time_zone = 'Asia/Tokyo';
    // An input update renders the newly read preference without changing the date.
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Latest description' },
    });
    if (changeDate)
      fireEvent.change(deadline, { target: { value: '2027-07-20T16:20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateInterview).toHaveBeenCalledWith(
        'round',
        expect.objectContaining({
          task_description: 'Latest description',
          task_deadline: changeDate
            ? '2027-07-20T14:20:00.000Z'
            : '2027-07-19T14:20:00Z',
        })
      )
    );
  }
);

it('constrains long saved type names and next-step grid text', async () => {
  const name = 'W'.repeat(187);
  const next = 'https://example.test/' + 'z'.repeat(240);
  interview.mockResolvedValue({
    id: 'round',
    revision: 1,
    application_id: 'app',
    company: 'River',
    round_type: { name },
    next_steps: next,
  });
  show();
  const heading = await screen.findByRole('heading', { name });
  expect(heading).toHaveClass('min-w-0', 'flex-1');
  expect(heading.closest('[class*=overflow-wrap]')).toBeInTheDocument();
  const nextText = screen.getByText(next);
  expect(nextText.parentElement).toHaveClass('min-w-0');
  expect(nextText.parentElement?.parentElement).toHaveClass('grid-cols-1');
});
