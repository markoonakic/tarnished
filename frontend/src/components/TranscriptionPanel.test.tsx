import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../lib/api';
import type { InternalAxiosRequestConfig } from 'axios';
import type { Round } from '../lib/types';
import TranscriptionPanel from './TranscriptionPanel';

const round = {
  id: 'round',
  media_generation: 1,
  transcript_generation: 4,
  media: [{ id: 'media', original_filename: 'recording.wav' }],
} as Round;
const speech = {
  available: true,
  provider: 'openai',
  model: 'whisper-1',
  configuration_revision: 'speech-revision',
  external_processing: 'Explicit external processing disclosure',
  input_disclosure: 'Only audio channels, no video frames',
  message: 'Unverified route',
};
const original = api.defaults.adapter;
let requests: InternalAxiosRequestConfig[];
let jobs: unknown[];
let available: boolean;
beforeEach(() => {
  requests = [];
  jobs = [];
  available = true;
  api.defaults.adapter = async (config) => {
    requests.push(config);
    const data =
      config.url === '/api/ai-capabilities'
        ? { speech: { ...speech, available } }
        : jobs;
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
});
afterEach(() => {
  cleanup();
  api.defaults.adapter = original;
  vi.restoreAllMocks();
});

it('TranscriptionPanel discloses input before explicit revision-bound start; GET never starts work', async () => {
  render(
    <TranscriptionPanel round={round} onChange={vi.fn()} onResult={vi.fn()} />
  );
  await screen.findByText(/Audio is sent to the configured speech service/);
  expect(screen.queryByText('Unverified route')).not.toBeInTheDocument();
  expect(
    screen.getByText(
      /text analysis service to assign parts and roles automatically/
    )
  ).toBeVisible();
  expect(requests.every((r) => r.method === 'get')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Start transcription' }));
  await waitFor(() =>
    expect(requests.filter((r) => r.method === 'post')).toHaveLength(1)
  );
  const call = requests.find((r) => r.method === 'post')!;
  expect(call.url).toBe('/api/rounds/round/media/media/transcription');
  expect(call.headers.get('Expected-Transcript-Generation')).toBe('4');
  expect(call.headers.get('Speech-Configuration-Revision')).toBe(
    'speech-revision'
  );
  expect(call.headers.get('Request-Intent')).toMatch(/^[a-f0-9-]{36}$/);
});

it('TranscriptionPanel explains uncertain retry and requires explicit retry intent', async () => {
  jobs = [
    {
      id: 'job',
      media_id: 'media',
      state: 'interrupted',
      stage: 'interrupted',
      uncertain: true,
      coverage: [],
      completed_chunks: 1,
      provider: 'openai',
      model: 'whisper-1',
    },
  ];
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(
    <TranscriptionPanel round={round} onChange={vi.fn()} onResult={vi.fn()} />
  );
  const retry = await screen.findByRole('button', {
    name: 'Retry transcription',
  });
  expect(
    screen.queryByRole('button', {
      name: /^(Start transcription|Transcribe again)$/,
    })
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Retrying may repeat work or charges/)
  ).toBeInTheDocument();
  fireEvent.click(retry);
  expect(requests.every((r) => r.method === 'get')).toBe(true);
  confirm.mockReturnValue(true);
  fireEvent.click(retry);
  await waitFor(() =>
    expect(
      requests.some(
        (r) => r.url === '/api/transcriptions/job/retry' && r.method === 'post'
      )
    ).toBe(true)
  );
});

it('starts transcription for the recording chosen on the round card', async () => {
  const twoRecordings = {
    ...round,
    media: [
      ...round.media,
      { ...round.media[0], id: 'second', original_filename: 'second.wav' },
    ],
  };
  render(
    <TranscriptionPanel
      round={twoRecordings}
      initialMediaId="second"
      onChange={vi.fn()}
      onResult={vi.fn()}
    />
  );
  await screen.findByText(/Audio is sent to the configured speech service/);
  expect(screen.getByRole('combobox')).toHaveValue('second');
  fireEvent.click(screen.getByRole('button', { name: 'Start transcription' }));
  await waitFor(() =>
    expect(
      requests.some(
        (r) =>
          r.method === 'post' &&
          r.url === '/api/rounds/round/media/second/transcription'
      )
    ).toBe(true)
  );
});

it('shows active work on another recording instead of silently blocking the selected one', async () => {
  jobs = [
    {
      id: 'active',
      media_id: 'other',
      state: 'transcribing',
      stage: 'dispatching',
      uncertain: true,
      coverage: [],
      completed_chunks: 0,
      provider: 'local',
      model: 'speech',
    },
  ];
  render(
    <TranscriptionPanel
      round={{
        ...round,
        media: [
          ...round.media,
          { ...round.media[0], id: 'other', original_filename: 'other.wav' },
        ],
      }}
      initialMediaId="media"
      onChange={vi.fn()}
      onResult={vi.fn()}
    />
  );
  expect(await screen.findByText(/Transcribing other.wav/)).toBeVisible();
  expect(
    screen.queryByText(/Retrying may repeat work or charges/)
  ).not.toBeInTheDocument();
  expect(requests.every((r) => r.method === 'get')).toBe(true);
});

it('keeps the same job active while assigning roles, with no new user request', async () => {
  jobs = [
    {
      id: 'job',
      media_id: 'media',
      state: 'transcribing',
      stage: 'structuring',
      uncertain: true,
      coverage: [],
      completed_chunks: 1,
      provider: 'local',
      model: 'speech',
    },
  ];
  render(
    <TranscriptionPanel round={round} onChange={vi.fn()} onResult={vi.fn()} />
  );
  expect(
    await screen.findByText(/Assigning parts and roles for recording.wav/)
  ).toBeVisible();
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('Assigning parts and roles');
  expect(status.querySelector('.animate-spin')).not.toBeNull();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(requests.every((r) => r.method === 'get')).toBe(true);
});

it('TranscriptionPanel unavailable configuration cannot dispatch', async () => {
  available = false;
  render(
    <TranscriptionPanel round={round} onChange={vi.fn()} onResult={vi.fn()} />
  );
  await screen.findByText(/Transcription is unavailable/);
  expect(
    screen.getByRole('button', { name: 'Start transcription' })
  ).toBeDisabled();
  expect(requests.every((r) => r.method === 'get')).toBe(true);
});

it('polls active work through completion without a check-status button', async () => {
  const job = {
    id: 'job',
    media_id: 'media',
    state: 'transcribing',
    stage: 'structuring',
    uncertain: false,
    coverage: [],
    completed_chunks: 1,
    provider: 'local',
    model: 'speech',
  };
  jobs = [job];
  const onChange = vi.fn();
  render(
    <TranscriptionPanel round={round} onChange={onChange} onResult={vi.fn()} />
  );
  await screen.findByText(/Assigning parts and roles for/);
  expect(
    screen.queryByRole('button', { name: 'Check status' })
  ).not.toBeInTheDocument();
  jobs = [{ ...job, state: 'complete' }];
  await screen.findByText('Transcript ready', {}, { timeout: 2500 });
  expect(onChange).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'View transcript' })).toBeVisible();
});

it('shows visible loading feedback when retrying a failed status read', async () => {
  api.defaults.adapter = async () => {
    throw new Error('Offline');
  };
  render(
    <TranscriptionPanel round={round} onChange={vi.fn()} onResult={vi.fn()} />
  );
  await screen.findByRole('alert');
  let resolve!: (value: unknown) => void;
  const pending = new Promise((done) => {
    resolve = done;
  });
  api.defaults.adapter = async (config) => {
    await pending;
    return {
      data: config.url === '/api/ai-capabilities' ? { speech } : [],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  fireEvent.click(
    screen.getByRole('button', { name: 'Try loading status again' })
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Loading speech service'
  );
  resolve(null);
  await screen.findByText(/Audio is sent to the configured speech service/);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Start transcription' })
  ).toBeEnabled();
});
