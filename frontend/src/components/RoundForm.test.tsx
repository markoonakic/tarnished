import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import type { Round } from '@/lib/types';
import RoundForm from './RoundForm';
const round: Round = {
  id: 'round-1',
  revision: 3,
  round_type: { id: 'technical', name: 'Technical' },
  scheduled_at: '2026-11-01T06:30:27Z',
  completed_at: null,
  time_zone: 'America/New_York',
  outcome: null,
  notes_summary: null,
  transcript_summary: null,
  transcript_path: null,
  transcript_original_filename: null,
  media: [],
  created_at: '2026-01-01T00:00Z',
};
const adapter = api.defaults.adapter;
let writes: { method: string; data: Record<string, unknown>; url?: string }[];
let failRecording = false;
beforeEach(() => {
  writes = [];
  failRecording = false;
  queryClient.clear();
  api.defaults.adapter = async (config) => {
    let data: unknown = round;
    if (config.url === '/api/user-preferences')
      data = { time_zone_mode: 'manual', time_zone: 'Europe/Belgrade' };
    if (config.url === '/api/round-types') data = [round.round_type];
    if (config.url === '/api/contacts') data = { items: [], total: 0 };
    if (['post', 'patch', 'put'].includes(config.method ?? '')) {
      const input =
        config.data instanceof FormData
          ? { file: (config.data.get('file') as File).name }
          : JSON.parse(config.data);
      writes.push({ method: config.method ?? '', data: input, url: config.url });
      if (config.url?.endsWith('/media') && failRecording) {
        failRecording = false;
        throw new Error('Upload failed');
      }
      data = {
        ...round,
        ...input,
        transcript_generation: config.url?.endsWith('/transcript') ? 1 : 0,
      };
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  api.defaults.adapter = adapter;
});
function show(value?: Round) {
  const save = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <RoundForm
        applicationId="app-1"
        round={value}
        onSave={save}
        onPersist={vi.fn()}
        onCancel={vi.fn()}
      />
    </QueryClientProvider>
  );
  return save;
}
it('keeps an unchanged folded instant and seconds while saving interview metadata with the expected revision', async () => {
  const save = show(round);
  expect(await screen.findByLabelText('Scheduled Date')).toHaveValue(
    '2026-11-01'
  );
  expect(screen.getAllByLabelText('Time (optional)')[0]).toHaveValue('01:30');
  fireEvent.change(screen.getByLabelText('Duration (minutes)'), {
    target: { value: '60' },
  });
  fireEvent.change(screen.getByLabelText('Meeting link'), {
    target: { value: 'https://example.com/meeting' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(writes[0].data).toMatchObject({
    expected_revision: 3,
    time_zone: 'America/New_York',
    duration_minutes: 60,
    mode: 'video',
    meeting_url: 'https://example.com/meeting',
  });
  expect(writes[0].data).not.toHaveProperty('scheduled_at');
  expect(screen.getByRole('button', { name: 'Add Media' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Add transcript' })
  ).toBeInTheDocument();
});
it('creates a round with a UTC instant from the selected zone and does not start media or AI work', async () => {
  const save = show();
  await screen.findByLabelText('Scheduled Date');
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Round Type' })
    ).toHaveTextContent('Technical')
  );
  fireEvent.change(screen.getByLabelText('Scheduled Date'), {
    target: { value: '2026-10-10' },
  });
  fireEvent.change(screen.getAllByLabelText('Time (optional)')[0], {
    target: { value: '15:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    method: 'post',
    data: {
      scheduled_at: '2026-10-10T13:00:00.000Z',
      time_zone: 'Europe/Belgrade',
      round_type_id: 'technical',
    },
  });
});
it('uploads both transcript and recording from Add Round and retries on the same saved round', async () => {
  const save = show();
  await screen.findByLabelText('Scheduled Date');
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Round Type' })
    ).toHaveTextContent('Technical')
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add transcript' }));
  fireEvent.change(document.querySelector('input[accept*=".srt"]')!, {
    target: {
      files: [new File(['Hello'], 'interview.txt', { type: 'text/plain' })],
    },
  });
  fireEvent.change(document.querySelector('input[accept*=".mp4"]')!, {
    target: {
      files: [new File(['audio'], 'interview.wav', { type: 'audio/wav' })],
    },
  });
  failRecording = true;
  fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'recording upload failed'
  );
  // The failed recording stays listed; the uploaded transcript is not sent again.
  expect(screen.getByText('interview.wav')).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry save and upload' })
  );
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(
    writes.filter((w) => w.url === '/api/applications/app-1/rounds')
  ).toHaveLength(1);
  expect(
    writes.filter((w) => w.url === '/api/rounds/round-1/transcript')
  ).toHaveLength(1);
  expect(
    writes.filter((w) => w.url === '/api/rounds/round-1/media')
  ).toHaveLength(2);
});
it('rejects a nonexistent local time without a write and keeps the entered date', async () => {
  show(round);
  await screen.findByLabelText('Scheduled Date');
  fireEvent.change(screen.getByLabelText('Scheduled Date'), {
    target: { value: '2026-03-08' },
  });
  fireEvent.change(screen.getAllByLabelText('Time (optional)')[0], {
    target: { value: '02:30' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('does not exist');
  expect(writes).toHaveLength(0);
  expect(screen.getByLabelText('Scheduled Date')).toHaveValue('2026-03-08');
});

it('queues several recordings and pasted transcript text and uploads them after the round is created', async () => {
  const save = show();
  await screen.findByLabelText('Scheduled Date');
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Round Type' })
    ).toHaveTextContent('Technical')
  );
  const media = document.querySelector('input[accept*=".mp4"]')!;
  fireEvent.change(media, {
    target: { files: [new File(['a'], 'one.mp3', { type: 'audio/mpeg' })] },
  });
  fireEvent.change(media, {
    target: { files: [new File(['b'], 'two.mp4', { type: 'video/mp4' })] },
  });
  fireEvent.change(media, {
    target: { files: [new File(['c'], 'gone.wav', { type: 'audio/wav' })] },
  });
  expect(screen.getByText('one.mp3')).toBeInTheDocument();
  expect(screen.getByText('two.mp4')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[2]);
  expect(screen.queryByText('gone.wav')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add transcript' }));
  fireEvent.change(screen.getByLabelText('Transcript text'), {
    target: { value: 'Interviewer: Hello' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(writes.map((w) => w.url)).toEqual([
    '/api/applications/app-1/rounds',
    '/api/rounds/round-1/transcript',
    '/api/rounds/round-1/media',
    '/api/rounds/round-1/media',
  ]);
  expect(writes[1]).toMatchObject({
    method: 'put',
    data: { text: 'Interviewer: Hello', format: 'txt' },
  });
  expect(writes.slice(2).map((w) => w.data.file)).toEqual([
    'one.mp3',
    'two.mp4',
  ]);
});
