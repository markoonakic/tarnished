import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../lib/api';
import { queryClient } from '../lib/queryClient';
import type { Round } from '../lib/types';
import RoundCard from './InterviewRecording';
import ApplicationRoundCard from './RoundCard';
import { MemoryRouter } from 'react-router-dom';
import TranscriptionPanel from './TranscriptionPanel';
import i18n from '../lib/i18n';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ error: vi.fn() }) }));
const round: Round = {
  id: 'round-1',
  round_type: { id: 'type-1', name: 'Interview' },
  scheduled_at: null,
  completed_at: null,
  outcome: null,
  notes_summary: 'Keep notes',
  transcript_summary: 'Keep summary',
  transcript_path: null,
  transcript_original_filename: null,
  media_generation: 1,
  media: [
    {
      id: 'media-1',
      file_path: 'uploads/first.wav',
      original_filename: 'first.wav',
      media_type: 'audio',
      uploaded_at: '2026-01-01',
      byte_count: 16044,
      probed_duration_seconds: 1,
      validation: 'audio_decode_check',
    },
  ],
  created_at: '2026-01-01',
};
const adapter = api.defaults.adapter;
let requests: InternalAxiosRequestConfig[];
let failure: number;
let completedChunks: number;
beforeEach(() => {
  queryClient.clear();
  requests = [];
  failure = 422;
  completedChunks = 0;
  api.defaults.adapter = async (config) => {
    requests.push(config);
    let data: unknown = round;
    if (config.url === '/api/user-preferences')
      data = { time_zone_mode: 'manual', time_zone: 'UTC' };
    if (config.url === '/api/round-types') data = [round.round_type];
    if (config.url === '/api/ai-capabilities')
      data = { speech: { available: false, message: 'Disabled' } };
    if (config.url?.endsWith('/transcriptions'))
      data = completedChunks
        ? [
            {
              id: 'job-1',
              media_id: 'media-1',
              state: 'complete',
              completed_chunks: completedChunks,
            },
          ]
        : [];
    if (config.url?.endsWith('/interview-feedback'))
      data = {
        generation: 0,
        report: null,
        stale_reason: null,
        job: null,
        capability: { available: false, message: 'Disabled' },
      };
    if (config.url?.endsWith('/media') || config.method === 'delete') {
      if (failure)
        throw new AxiosError('Recording failed', undefined, config, undefined, {
          data: {
            code: 'no_audio_track',
            detail:
              'Recording has no audio track. Upload a recording containing speech',
          },
          status: failure,
          statusText: 'Failed',
          headers: {},
          config,
        });
      data = { ...round, media_generation: 2 };
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
});
afterEach(async () => {
  cleanup();
  queryClient.clear();
  api.defaults.adapter = adapter;
  await i18n.changeLanguage('en');
});

it.each([
  [1, 'Završen 1 deo zvuka.'],
  [2, 'Završena 2 dela zvuka.'],
  [5, 'Završeno 5 delova zvuka.'],
  [21, 'Završen 21 deo zvuka.'],
  [22, 'Završena 22 dela zvuka.'],
])(
  'uses Serbian plurals for %s completed audio parts',
  async (count, expected) => {
    await i18n.changeLanguage('sr-Latn');
    completedChunks = count;
    render(
      <QueryClientProvider client={queryClient}>
        <TranscriptionPanel
          round={round}
          onChange={vi.fn()}
          onResult={vi.fn()}
        />
      </QueryClientProvider>
    );
    expect(await screen.findByText(expected)).toBeVisible();
    expect(requests.every((request) => request.method === 'get')).toBe(true);
  }
);

it('restores the complete application round card without starting media or feedback jobs', async () => {
  const edit = vi.fn();
  const remove = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ApplicationRoundCard
          round={{
            ...round,
            scheduled_at: '2026-10-08T10:00:00Z',
            completed_at: '2026-10-08T11:00:00Z',
            mode: 'video',
            contact_ids: ['contact'],
            preparation: { review_topics: ['SQL'] },
          }}
          onEdit={edit}
          onDelete={remove}
          onMediaChange={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  expect(screen.getByText('Keep notes')).toBeVisible();
  expect(screen.getByText(/Scheduled:/)).toBeVisible();
  expect(screen.getByText(/Completed:/)).toBeVisible();
  expect(screen.getByText('first.wav')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add Media' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Add transcript' })).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Interview feedback' })
  ).toBeVisible();
  expect(screen.getByRole('link', { name: /Open interview/ })).toHaveAttribute(
    'href',
    '/interviews/round-1'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit round' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete round' }));
  expect(edit).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
  expect(requests.every((request) => request.method === 'get')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Transcribe' }));
  expect(
    screen.getByRole('dialog', { name: 'Transcribe recording' })
  ).toBeVisible();
});

it('opens transcription or feedback only on request', async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <RoundCard
        round={round}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMediaChange={vi.fn()}
      />
    </QueryClientProvider>
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.queryByText(/configured.*service|Processing details/i)
  ).not.toBeInTheDocument();
  expect(
    screen.getAllByRole('button', { name: 'Add transcript' })
  ).toHaveLength(1);
  expect(
    requests.some(
      (r) =>
        r.url?.includes('interview-feedback') ||
        r.url?.includes('transcriptions')
    )
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Transcribe' }));
  expect(
    screen.getByRole('dialog', { name: 'Transcribe recording' })
  ).toBeVisible();
  expect(
    screen.getByRole('heading', { name: 'Transcribe recording', level: 2 })
  ).toHaveClass('text-xl');
  expect(screen.getAllByText('Transcribe recording')).toHaveLength(1);
  await screen.findByText(/Transcription is unavailable/);
  fireEvent.click(screen.getByRole('button', { name: 'Close transcription' }));
  fireEvent.click(screen.getByRole('button', { name: 'Interview feedback' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: 'Interview feedback' })
  ).toBeVisible();
  await screen.findByText(/New feedback is unavailable/);
  expect(requests.every((r) => r.method === 'get')).toBe(true);
});

it('RoundCard retains rejected file, retries the same precondition and requires explicit conflict recovery', async () => {
  const onMediaChange = vi.fn();
  const card = (value: Round) => (
    <QueryClientProvider client={queryClient}>
      <RoundCard
        round={value}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMediaChange={onMediaChange}
      />
    </QueryClientProvider>
  );
  const view = render(card(round));
  const file = new File(['synthetic'], 'replacement.wav');
  fireEvent.change(view.container.querySelectorAll('input[type=file]')[1], {
    target: { files: [file] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('no audio track');
  expect(screen.getByText(/Pending: replacement.wav/)).toBeVisible();
  expect(
    screen.queryByText(/Existing media\/transcripts remain available/)
  ).not.toBeInTheDocument();
  const tips = screen.getAllByRole('button', { name: 'Media Files' });
  fireEvent.mouseEnter(tips[tips.length - 1].parentElement!);
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'A lost response may mean the upload succeeded'
  );
  fireEvent.mouseLeave(tips[tips.length - 1].parentElement!);
  expect(screen.getByText('first.wav', { selector: 'span' })).toBeVisible();
  const uploads = () => requests.filter((r) => r.url?.endsWith('/media'));
  expect(uploads()[0].headers.get('Expected-Media-Generation')).toBe('1');
  expect(uploads()[0].headers.get('Replace-Media-Id')).toBe('media-1');
  failure = 409;
  view.rerender(card({ ...round, media_generation: 2 }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry recording upload' })
  );
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Retrying cannot resolve this conflict'
    )
  );
  expect(uploads()[1].headers.get('Expected-Media-Generation')).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'Reload recordings' }));
  expect(onMediaChange).toHaveBeenCalledOnce();
  expect(screen.getByText(/Pending: replacement.wav/)).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Discard pending upload' })
  );
  expect(screen.queryByText(/Pending:/)).not.toBeInTheDocument();
  failure = 0;
  fireEvent.change(view.container.querySelectorAll('input[type=file]')[1], {
    target: { files: [file] },
  });
  await waitFor(() => expect(onMediaChange).toHaveBeenCalledTimes(2));
  expect(uploads()[2].headers.get('Expected-Media-Generation')).toBe('2');
});

it('RoundCard shows imported duration as unverified and disables inline playback', () => {
  render(
    <QueryClientProvider client={queryClient}>
      <RoundCard
        round={{
          ...round,
          media: [{ ...round.media[0], validation: 'imported_unverified' }],
        }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMediaChange={vi.fn()}
      />
    </QueryClientProvider>
  );
  expect(screen.getByTitle(/Duration unverified/)).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute(
    'title',
    expect.stringContaining(
      'Transcribe to check this recording and enable playback'
    )
  );
});

it('RoundCard stale delete keeps metadata and exposes explicit review/reload without a pending upload', async () => {
  const onMediaChange = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  failure = 409;
  render(
    <QueryClientProvider client={queryClient}>
      <RoundCard
        round={round}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMediaChange={onMediaChange}
      />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Reload and review recordings before deciding to delete again'
  );
  expect(screen.getByText('first.wav', { selector: 'span' })).toBeVisible();
  expect(screen.queryByText(/Pending:/)).not.toBeInTheDocument();
  expect(onMediaChange).not.toHaveBeenCalled();
  expect(requests.filter((r) => r.method === 'delete')).toHaveLength(1);
  expect(
    requests
      .find((r) => r.method === 'delete')
      ?.headers.get('Expected-Media-Generation')
  ).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'Reload recordings' }));
  expect(onMediaChange).toHaveBeenCalledOnce();
  expect(requests.filter((r) => r.method === 'delete')).toHaveLength(1);
  vi.restoreAllMocks();
});
