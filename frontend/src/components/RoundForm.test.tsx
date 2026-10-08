import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { USER_PREFERENCES_QUERY_KEY } from '../hooks/useUserPreferences';
import { DEFAULT_USER_PREFERENCES } from '../lib/userPreferences';
import type { Round } from '../lib/types';
import RoundForm from './RoundForm';

const initialRound: Round = {
  id: 'saved-round',
  round_type: { id: 'type-1', name: 'Interview' },
  scheduled_at: '2026-11-01T06:30:27Z',
  completed_at: '2026-11-01T07:30:15Z',
  outcome: 'passed',
  notes_summary: 'notes',
  transcript_summary: 'summary',
  transcript_path: null,
  transcript_original_filename: null,
  media: [],
  created_at: '2026-01-01T00:00:00Z',
};
let requests: InternalAxiosRequestConfig[];
let failUpload: boolean;
let uploadFailureStatus: number;
let stored: Round;
let preferenceTimeZone: string;
let rejectNextRoundMutation: boolean;
const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  requests = [];
  failUpload = true;
  uploadFailureStatus = 500;
  preferenceTimeZone = 'America/New_York';
  rejectNextRoundMutation = false;
  stored = structuredClone(initialRound);
  queryClient.clear();
  api.defaults.adapter = async (config) => {
    requests.push(config);
    let data: unknown = {};
    if (config.url === '/api/user-preferences')
      data = { time_zone_mode: 'manual', time_zone: preferenceTimeZone };
    else if (config.url === '/api/round-types')
      data = [initialRound.round_type];
    else if (config.url?.endsWith('/transcript')) {
      if (failUpload)
        throw new AxiosError('Upload failed', undefined, config, undefined, {
          data: {},
          status: uploadFailureStatus,
          statusText: 'failed',
          headers: {},
          config,
        });
      stored = { ...stored, transcript_path: 'transcript.pdf' };
      data = stored;
    } else if (config.method === 'post' || config.method === 'patch') {
      if (rejectNextRoundMutation) {
        rejectNextRoundMutation = false;
        throw new AxiosError(
          'Time zone conflict',
          undefined,
          config,
          undefined,
          {
            data: {
              code: 'round_time_zone_changed',
              detail:
                'Round time zone changed. Reload time zone preferences and saved dates before saving.',
            },
            status: 409,
            statusText: 'Conflict',
            headers: {},
            config,
          }
        );
      }
      stored = {
        ...stored,
        ...(config.method === 'post'
          ? { scheduled_at: null, completed_at: null }
          : {}),
        ...JSON.parse(config.data),
      };
      data = stored;
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
});
afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  queryClient.clear();
});

function show(round?: Round) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const onPersist = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RoundForm
        applicationId="app-1"
        round={round}
        onSave={onSave}
        onCancel={onCancel}
        onPersist={onPersist}
      />
    </QueryClientProvider>
  );
  return { ...view, onSave, onCancel, onPersist };
}

describe('RoundForm API payload and partial save', () => {
  it('keeps the exact unchanged fold instant/seconds and sends null for cleared fields', async () => {
    const { onSave } = show(initialRound);
    await screen.findByLabelText('Scheduled Date');
    expect(screen.getByLabelText('Scheduled Date')).toHaveValue('2026-11-01');
    expect(screen.getAllByLabelText('Time (optional)')[0]).toHaveValue('01:30');
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Transcript Summary'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Completed Date'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Outcome' }));
    fireEvent.click(screen.getByRole('option', { name: 'Pending' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const body = JSON.parse(requests.find((r) => r.method === 'patch')!.data);
    expect(body).toEqual({
      round_type_id: 'type-1',
      completed_at: null,
      outcome: null,
      notes_summary: null,
      transcript_summary: null,
    });
    expect(stored.scheduled_at).toBe(initialRound.scheduled_at);
  });

  it('retains the created identity and summary after upload failure; retry never creates another round', async () => {
    const { container, onSave, onPersist } = show();
    await screen.findByLabelText('Scheduled Date');
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Round Type' })
      ).toHaveTextContent('Interview')
    );
    fireEvent.change(screen.getByLabelText('Transcript Summary'), {
      target: { value: 'Keep this summary' },
    });
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: {
        files: [
          new File(['pdf'], 'transcript.pdf', { type: 'application/pdf' }),
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Round saved, but transcript upload failed'
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(onPersist).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'saved-round',
        transcript_summary: 'Keep this summary',
      })
    );
    const created = JSON.parse(
      requests.find((r) => r.url?.endsWith('/rounds'))!.data
    );
    expect(created).toEqual({
      round_type_id: 'type-1',
      transcript_summary: 'Keep this summary',
    });
    failUpload = false;
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry save and upload' })
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'saved-round',
          transcript_summary: 'Keep this summary',
          transcript_path: 'transcript.pdf',
        })
      )
    );
    expect(
      requests.filter((r) => r.url === '/api/applications/app-1/rounds')
    ).toHaveLength(1);
    expect(
      requests.filter((r) => r.url === '/api/rounds/saved-round/transcript')
    ).toHaveLength(2);
  });

  it('explains upload conflict recovery and retains fields/file without adopting a newer generation', async () => {
    const round = { ...initialRound, transcript_generation: 1 };
    const { container, onSave, onCancel, onPersist } = show(round);
    await screen.findByLabelText('Scheduled Date');
    stored.transcript_generation = 2; // Another tab replaced the transcript.
    uploadFailureStatus = 409;
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Keep my notes' },
    });
    fireEvent.change(screen.getByLabelText('Transcript Summary'), {
      target: { value: 'Keep my summary' },
    });
    const file = new File(['Replacement'], 'replacement.txt');
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Retrying cannot resolve this conflict. Close and reopen the round, then review the current transcript'
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'Retry to upload to this same round'
    );
    expect(screen.getByLabelText('Notes')).toHaveValue('Keep my notes');
    expect(screen.getByLabelText('Transcript Summary')).toHaveValue(
      'Keep my summary'
    );
    expect(screen.getByLabelText('Scheduled Date')).toHaveValue('2026-11-01');
    expect(
      screen.getByRole('button', { name: 'replacement.txt' })
    ).toBeEnabled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onPersist).toHaveBeenCalledWith(
      expect.objectContaining({ id: round.id, transcript_generation: 2 })
    );
    // An attempted retry must not silently overwrite the unseen newer transcript.
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry save and upload' })
    );
    await screen.findByRole('alert');
    const uploads = requests.filter((r) => r.url?.endsWith('/transcript'));
    expect(uploads).toHaveLength(2);
    for (const upload of uploads) {
      expect(upload.url).toBe(`/api/rounds/${round.id}/transcript`);
      expect(upload.headers.get('Expected-Transcript-Generation')).toBe('1');
      expect((upload.data as FormData).get('file')).toBe(file);
    }
    expect(
      requests.filter((r) => r.url === '/api/user-preferences')
    ).toHaveLength(1);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close (round saved)' })
    );
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: round.id,
        notes_summary: 'Keep my notes',
        transcript_summary: 'Keep my summary',
        transcript_generation: 2,
      })
    );
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'retries a newly saved blank-time schedule with clear=%s using the persisted control baseline',
    async (clear) => {
      const { container, onSave } = show();
      await screen.findByLabelText('Scheduled Date');
      await waitFor(() =>
        expect(
          screen.getByRole('combobox', { name: 'Round Type' })
        ).toHaveTextContent('Interview')
      );
      fireEvent.change(screen.getByLabelText('Scheduled Date'), {
        target: { value: '2026-11-02' },
      });
      fireEvent.change(container.querySelector('input[type=file]')!, {
        target: { files: [new File(['pdf'], 'transcript.pdf')] },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
      await screen.findByRole('alert');
      expect(stored.scheduled_at).toBe('2026-11-02T00:00:00');
      expect(screen.getByLabelText('Time (optional)')).toHaveValue('');
      if (clear)
        fireEvent.change(screen.getByLabelText('Scheduled Date'), {
          target: { value: '' },
        });
      failUpload = false;
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry save and upload' })
      );
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const patches = requests.filter((r) => r.method === 'patch');
      expect(patches).toHaveLength(1);
      expect(patches[0].url).toBe('/api/rounds/saved-round');
      if (clear) {
        expect(JSON.parse(patches[0].data).scheduled_at).toBeNull();
        expect(stored.scheduled_at).toBeNull();
      } else {
        expect(JSON.parse(patches[0].data)).not.toHaveProperty('scheduled_at');
        expect(stored.scheduled_at).toBe('2026-11-02T00:00:00');
      }
      expect(
        requests.filter((r) => r.url === '/api/applications/app-1/rounds')
      ).toHaveLength(1);
    }
  );

  it('rebases cached-preference controls only with confirmation and preserves untouched instants after refetch', async () => {
    queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, {
      ...DEFAULT_USER_PREFERENCES,
      time_zone_mode: 'manual',
      time_zone: 'America/New_York',
    });
    const { container, onSave } = show(initialRound);
    expect(screen.getAllByLabelText('Time (optional)')[0]).toHaveValue('01:30');
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Only notes changed' },
    });
    preferenceTimeZone = 'Asia/Tokyo';
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: USER_PREFERENCES_QUERY_KEY,
      });
    });
    await screen.findByRole('button', {
      name: 'Reload saved dates in Asia/Tokyo',
    });
    expect(
      requests.filter((r) => r.url === '/api/user-preferences')
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getAllByLabelText('Time (optional)')[0]).toHaveValue('01:30');
    fireEvent.submit(container.querySelector('form')!);
    expect(requests.filter((r) => r.method === 'patch')).toHaveLength(0);
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload saved dates in Asia/Tokyo' })
    );
    expect(screen.getAllByLabelText('Time (optional)')[0]).toHaveValue('15:30');
    expect(screen.getAllByLabelText('Time (optional)')[1]).toHaveValue('16:30');
    expect(screen.getByLabelText('Notes')).toHaveValue('Only notes changed');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const body = JSON.parse(requests.find((r) => r.method === 'patch')!.data);
    expect(body).not.toHaveProperty('scheduled_at');
    expect(body).not.toHaveProperty('completed_at');
    expect(stored.scheduled_at).toBe(initialRound.scheduled_at);
    expect(stored.completed_at).toBe(initialRound.completed_at);
  });

  it('keeps a partially created identity and non-date edits when confirming a new zone', async () => {
    const { container, onSave } = show();
    await screen.findByLabelText('Scheduled Date');
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Round Type' })
      ).toHaveTextContent('Interview')
    );
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: { files: [new File(['pdf'], 'transcript.pdf')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Scheduled Date'), {
      target: { value: '2026-12-20' },
    });
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Keep this edit' },
    });
    preferenceTimeZone = 'Asia/Tokyo';
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: USER_PREFERENCES_QUERY_KEY,
      });
    });
    expect(
      await screen.findByText(/This discards unsaved date\/time edits only/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry save and upload' })
    ).toBeDisabled();
    expect(screen.getByLabelText('Scheduled Date')).toHaveValue('2026-12-20');
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload saved dates in Asia/Tokyo' })
    );
    expect(screen.getByLabelText('Scheduled Date')).toHaveValue('');
    expect(screen.getByLabelText('Time (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Notes')).toHaveValue('Keep this edit');
    failUpload = false;
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry save and upload' })
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'saved-round',
          notes_summary: 'Keep this edit',
          transcript_path: 'transcript.pdf',
        })
      )
    );
    const patch = requests.find((r) => r.method === 'patch')!;
    expect(patch.url).toBe('/api/rounds/saved-round');
    expect(JSON.parse(patch.data)).not.toHaveProperty('scheduled_at');
    expect(
      requests.filter((r) => r.url === '/api/applications/app-1/rounds')
    ).toHaveLength(1);
  });

  it('sends the displayed-zone precondition, then refetches on a stale-server conflict without losing a partial creation', async () => {
    const { container, onSave } = show();
    await screen.findByLabelText('Scheduled Date');
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Round Type' })
      ).toHaveTextContent('Interview')
    );
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: { files: [new File(['pdf'], 'transcript.pdf')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
    await screen.findByRole('alert');
    const creation = requests.find(
      (r) => r.url === '/api/applications/app-1/rounds'
    )!;
    expect(creation.headers.get('Expected-Round-Time-Zone')).toBe(
      'America/New_York'
    );
    const deviceZone = creation.headers.get('Time-Zone');
    fireEvent.change(screen.getByLabelText('Scheduled Date'), {
      target: { value: '2026-12-20' },
    });
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Keep after conflict' },
    });
    preferenceTimeZone = 'Asia/Tokyo'; // Server changed, cached form preferences did not.
    rejectNextRoundMutation = true;
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry save and upload' })
    );
    await screen.findByText(
      /Round time zone changed. Reload time zone preferences/
    );
    const reload = await screen.findByRole('button', {
      name: 'Reload saved dates in Asia/Tokyo',
    });
    expect(
      requests
        .find((r) => r.method === 'patch')!
        .headers.get('Expected-Round-Time-Zone')
    ).toBe('America/New_York');
    expect(stored.scheduled_at).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(reload);
    expect(screen.getByLabelText('Notes')).toHaveValue('Keep after conflict');
    fireEvent.change(screen.getByLabelText('Scheduled Date'), {
      target: { value: '2026-12-20' },
    });
    fireEvent.change(screen.getByLabelText('Time (optional)'), {
      target: { value: '15:30' },
    });
    failUpload = false;
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry save and upload' })
    );
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patches = requests.filter((r) => r.method === 'patch');
    expect(patches).toHaveLength(2);
    expect(patches[1].url).toBe('/api/rounds/saved-round');
    expect(patches[1].headers.get('Expected-Round-Time-Zone')).toBe(
      'Asia/Tokyo'
    );
    expect(patches[1].headers.get('Time-Zone')).toBe(deviceZone);
    expect(JSON.parse(patches[1].data).scheduled_at).toBe(
      '2026-12-20T15:30:00'
    );
    expect(
      requests.filter((r) => r.url === '/api/applications/app-1/rounds')
    ).toHaveLength(1);
  });

  it('closing after failed upload reports the saved record, not cancellation', async () => {
    const { container, onSave, onCancel } = show();
    await screen.findByLabelText('Scheduled Date');
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Round Type' })
      ).toHaveTextContent('Interview')
    );
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: { files: [new File(['pdf'], 'transcript.pdf')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
    await screen.findByRole('alert');
    fireEvent.click(
      screen.getByRole('button', { name: 'Close (round saved)' })
    );
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'saved-round' })
    );
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('rejects invalid time without sending a mutation', async () => {
    show(initialRound);
    await screen.findByLabelText('Scheduled Date');
    fireEvent.change(screen.getAllByLabelText('Time (optional)')[0], {
      target: { value: '25:99' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid time'
    );
    expect(requests.filter((r) => r.method === 'patch')).toHaveLength(0);
  });
});
