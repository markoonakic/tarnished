import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import ApplicationDetail from './ApplicationDetail';
import type { Round } from '@/lib/types';

const rounds = ['A', 'B'].map(
  (id) =>
    ({
      id,
      notes_summary: 'Saved ' + id,
      scheduled_at: null,
      completed_at: null,
      outcome: null,
      transcript_path: null,
      transcript_original_filename: null,
      transcript_summary: null,
      created_at: '2026-10-01T00:00:00Z',
      media: [],
      round_type: { id: 'technical', name: 'Technical' },
    }) as Round
);
vi.mock('@/lib/applications', () => ({
  getApplication: vi.fn(async () => ({
    id: 'app',
    company: 'Acme',
    job_title: 'Engineer',
    status: { id: 'status', name: 'Applied' },
    applied_at: '2026-10-01',
    updated_at: '2026-10-01',
    created_at: '2026-10-01',
    requirements_must_have: [],
    requirements_nice_to_have: [],
    skills: [],
    rounds,
  })),
  deleteApplication: vi.fn(),
}));
vi.mock('@/hooks/useEffectiveDayKey', () => ({
  useEffectiveDayKey: () => '2026-10-10',
}));
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
vi.mock('@/lib/settings', () => ({ listStatuses: vi.fn(async () => []) }));
vi.mock('@/lib/userPreferences', () => ({
  getPreferences: vi.fn(async () => ({})),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('@/contexts/ToastContext', () => ({
  useToastContext: () => toast,
}));
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/slots/ApplicationContacts', () => ({
  default: () => null,
}));
vi.mock('@/components/slots/ApplicationReminders', () => ({
  default: () => null,
}));
vi.mock('@/components/slots/ApplicationNotes', () => ({ default: () => null }));
vi.mock('@/components/slots/ApplicationProfileMatch', () => ({
  default: () => null,
}));
vi.mock('@/components/slots/ApplicationExtractionReview', () => ({
  default: () => null,
}));
vi.mock('@/components/DocumentSection', () => ({ default: () => null }));
vi.mock('@/components/application/HistoryViewer', () => ({
  default: () => null,
}));
vi.mock('@/components/ApplicationModal', () => ({ default: () => null }));
vi.mock('@/components/RoundCard', () => ({
  default: ({ round, onEdit }: { round: Round; onEdit: () => void }) => (
    <button onClick={onEdit}>Edit {round.id}</button>
  ),
}));
vi.mock('@/components/RoundForm', () => ({
  default: function RoundEditor({
    round,
    onSave,
  }: {
    round?: Round;
    onSave: (round: Round) => void;
  }) {
    const [notes, setNotes] = useState(round?.notes_summary || '');
    const [file, setFile] = useState('');
    return (
      <section aria-label={'Editor ' + (round?.id || 'new')}>
        <textarea
          aria-label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <input
          aria-label="File"
          type="file"
          onChange={(e) => setFile(e.target.files?.[0]?.name || '')}
        />
        <span>{file}</span>
        <button
          onClick={() =>
            onSave({
              ...round,
              id: round?.id || 'created',
              notes_summary: notes,
            } as Round)
          }
        >
          Save round
        </button>
      </section>
    );
  },
}));
afterEach(cleanup);
function show() {
  render(
    <MemoryRouter initialEntries={['/applications/app']}>
      <Routes>
        <Route path="/applications/:id" element={<ApplicationDetail />} />
      </Routes>
    </MemoryRouter>
  );
}
it('keeps the first round editor, notes and queued file when a sibling editor opens', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit A' }));
  const a = screen.getByRole('region', { name: 'Editor A' });
  fireEvent.change(within(a).getByLabelText('Notes'), {
    target: { value: 'Keep A' },
  });
  fireEvent.change(within(a).getByLabelText('File'), {
    target: { files: [new File(['WEBVTT'], 'pending.vtt')] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Edit B' }));
  expect(within(a).getByLabelText('Notes')).toHaveValue('Keep A');
  expect(within(a).getByText('pending.vtt')).toBeVisible();
  expect(screen.getByRole('region', { name: 'Editor B' })).toBeVisible();
});
it.each(['A', 'new'])(
  'saving %s closes only that editor and keeps its sibling draft',
  async (saved) => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
    const a = screen.getByRole('region', { name: 'Editor A' });
    const fresh = screen.getByRole('region', { name: 'Editor new' });
    fireEvent.change(within(a).getByLabelText('Notes'), {
      target: { value: 'Keep A' },
    });
    fireEvent.change(within(fresh).getByLabelText('Notes'), {
      target: { value: 'Keep new' },
    });
    fireEvent.change(within(fresh).getByLabelText('File'), {
      target: { files: [new File(['audio'], 'pending.mp3')] },
    });
    fireEvent.click(
      within(saved === 'A' ? a : fresh).getByRole('button', {
        name: 'Save round',
      })
    );
    const retained = screen.getByRole('region', {
      name: saved === 'A' ? 'Editor new' : 'Editor A',
    });
    expect(within(retained).getByLabelText('Notes')).toHaveValue(
      saved === 'A' ? 'Keep new' : 'Keep A'
    );
    if (saved === 'A')
      expect(within(retained).getByText('pending.mp3')).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Editor ' + saved })
    ).not.toBeInTheDocument();
  }
);
