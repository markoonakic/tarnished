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

const { interview, updateInterview } = vi.hoisted(() => ({
  interview: vi.fn(),
  updateInterview: vi.fn(),
}));
vi.mock('@/lib/apiV030', () => ({ apiV030: { interview, updateInterview } }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    data: { time_zone_mode: 'manual', time_zone: 'UTC' },
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

async function editor() {
  render(
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
