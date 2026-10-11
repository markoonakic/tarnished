import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { AxiosError, type AxiosAdapter } from 'axios';
import i18n from '@/lib/i18n';
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
let writes: {
  method: string;
  data: Record<string, unknown>;
  url?: string;
  headers?: Record<string, unknown>;
}[];
let failRecording = false;
let loseCreateResponse = false;
let transcriptReads = 0;
let contactCreate: (() => Promise<void>) | undefined;
let contacts: { id: string; name: string }[];
beforeEach(() => {
  writes = [];
  failRecording = false;
  loseCreateResponse = false;
  transcriptReads = 0;
  contactCreate = undefined;
  contacts = [];
  queryClient.clear();
  api.defaults.adapter = async (config) => {
    let data: unknown = round;
    if (config.url === '/api/user-preferences')
      data = { time_zone_mode: 'manual', time_zone: 'Europe/Belgrade' };
    if (config.url === '/api/round-types') data = [round.round_type];
    if (config.url === '/api/contacts') {
      if (config.method === 'post') {
        await contactCreate?.();
        const contact = {
          id: 'created-contact',
          name: JSON.parse(config.data).name,
        };
        contacts.push(contact);
        data = contact;
      } else data = { items: contacts, total: contacts.length };
    }
    if (config.method === 'get' && config.url?.endsWith('/transcript')) {
      transcriptReads++;
      data = { generation: 99, transcript: null };
    }
    if (['post', 'patch', 'put'].includes(config.method ?? '')) {
      const input =
        config.data instanceof FormData
          ? { file: (config.data.get('file') as File).name }
          : JSON.parse(config.data);
      writes.push({
        method: config.method ?? '',
        data: input,
        url: config.url,
        headers: config.headers.toJSON(),
      });
      if (
        config.url === '/api/applications/app-1/rounds' &&
        loseCreateResponse
      ) {
        loseCreateResponse = false;
        throw new Error('Response lost');
      }
      if (config.url?.endsWith('/media') && failRecording) {
        failRecording = false;
        throw new Error('Upload failed');
      }
      if (config.url !== '/api/contacts')
        data = {
          ...round,
          ...input,
          transcript_generation: config.url?.endsWith('/transcript') ? 1 : 0,
          generation: 1,
        };
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
function show(value?: Round) {
  const save = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RoundForm
          applicationId="app-1"
          round={value}
          onSave={save}
          onPersist={vi.fn()}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return save;
}
it.each([undefined, round])(
  'waits for participant creation before saving New or Edit',
  async (value) => {
    let release!: () => void;
    contactCreate = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const save = show(value);
    await screen.findByLabelText('Notes');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(screen.getByPlaceholderText('Select a contact'), {
      target: { value: 'New participant' },
    });
    fireEvent.click(
      await screen.findByRole('option', { name: '+ Create "New participant"' })
    );
    const submit = screen.getByRole('button', {
      name: value ? 'Save' : 'Add Round',
    });
    expect(submit).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.submit(submit.closest('form')!);
    expect(writes.some((write) => write.url !== '/api/contacts')).toBe(false);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(release).toBeTypeOf('function'));
    await act(async () => release());
    await screen.findByRole('link', { name: 'New participant' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(
      writes.find((write) => write.url !== '/api/contacts')?.data.contact_ids
    ).toEqual(['created-contact']);
  }
);

it('clears a failed participant create after a successful retry', async () => {
  contactCreate = async () => {
    throw new Error('Offline');
  };
  const save = show();
  await screen.findByLabelText('Notes');
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  const choose = async () => {
    fireEvent.focus(screen.getByPlaceholderText('Select a contact'));
    fireEvent.change(screen.getByPlaceholderText('Select a contact'), {
      target: { value: 'Recovered participant' },
    });
    fireEvent.click(
      await screen.findByRole('option', {
        name: '+ Create "Recovered participant"',
      })
    );
  };
  await choose();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not load this data.'
  );
  contactCreate = undefined;
  await choose();
  await screen.findByRole('link', { name: 'Recovered participant' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(
    writes.find((write) => write.url !== '/api/contacts')?.data.contact_ids
  ).toEqual(['created-contact']);
});

it.each([undefined, round])(
  'warns before leaving an ordinary new or edit round draft without attachments',
  async (value) => {
    show(value);
    await screen.findByLabelText('Notes');
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Unsaved notes' },
    });
    fireEvent.change(screen.getByLabelText('Transcript Summary'), {
      target: { value: 'Unsaved summary' },
    });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByLabelText('Notes')).toHaveValue('Unsaved notes');
  }
);
it.each([undefined, round])(
  'keeps scheduled/completed times without dates instead of silently saving them',
  async (value) => {
    const save = show(value);
    await screen.findByLabelText('Notes');
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Round Type' })
      ).toHaveTextContent('Technical')
    );
    const index = value ? 1 : 0;
    fireEvent.change(
      screen.getByLabelText(value ? 'Completed Date' : 'Scheduled Date'),
      { target: { value: '' } }
    );
    const time = screen.getAllByLabelText('Time (optional)')[index];
    fireEvent.change(time, { target: { value: '19:35' } });
    fireEvent.click(
      screen.getByRole('button', { name: value ? 'Save' : 'Add Round' })
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a date for the time.'
    );
    expect(time).toHaveValue('19:35');
    expect(writes).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  }
);
it('keeps the time-zone recovery explanation in a HelpTip', async () => {
  show();
  const zone = await screen.findByRole('combobox', { name: 'Time zone' });
  fireEvent.change(zone, { target: { value: 'Europe/London' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Europe/London' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Your time zone changed to'
  );
  expect(
    screen.queryByText(/Before saving, reload saved dates/)
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'About reloading dates' })
  );
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'discards unsaved date/time edits only'
  );
});
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
  const recordings = writes.filter(
    (w) => w.url === '/api/rounds/round-1/media'
  );
  expect(recordings).toHaveLength(2);
  expect(recordings[0].headers?.['Idempotency-Key']).toBeTruthy();
  expect(recordings[1].headers?.['Idempotency-Key']).toBe(
    recordings[0].headers?.['Idempotency-Key']
  );
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

it('keeps the transcript generation from the edit snapshot instead of fetching and overwriting a newer transcript', async () => {
  show({ ...round, transcript_generation: 4 });
  await screen.findByLabelText('Scheduled Date');
  fireEvent.click(screen.getByRole('button', { name: 'Add transcript' }));
  fireEvent.change(screen.getByLabelText('Transcript text'), {
    target: { value: 'Older draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[0].data.expected_transcript_generation).toBe(4);
  expect(writes[1].headers?.['Expected-Transcript-Generation']).toBe('4');
  expect(transcriptReads).toBe(0);
});
it('reuses the create request key after a lost response', async () => {
  const save = show();
  await screen.findByLabelText('Scheduled Date');
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Round Type' })
    ).toHaveTextContent('Technical')
  );
  loseCreateResponse = true;
  fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
  await screen.findByText('Response lost');
  fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(writes).toHaveLength(2);
  expect(writes[0].headers?.['Idempotency-Key']).toBeTruthy();
  expect(writes[1].headers?.['Idempotency-Key']).toBe(
    writes[0].headers?.['Idempotency-Key']
  );
});
it('rejects an unsupported transcript file before it can be queued and keeps the form values', async () => {
  show();
  await screen.findByLabelText('Scheduled Date');
  fireEvent.change(screen.getByLabelText('Notes'), {
    target: { value: 'Keep notes' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add transcript' }));
  fireEvent.change(document.querySelector('input[accept*=".srt"]')!, {
    target: { files: [new File(['text'], 'wrong.exe')] },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unsupported transcript file'
  );
  expect(screen.queryByText('wrong.exe')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Notes')).toHaveValue('Keep notes');
  expect(writes).toHaveLength(0);
});
it('warns before leaving with queued recordings or pasted transcript text', async () => {
  show();
  await screen.findByLabelText('Scheduled Date');
  fireEvent.click(screen.getByRole('button', { name: 'Add transcript' }));
  fireEvent.change(screen.getByLabelText('Transcript text'), {
    target: { value: 'Pending transcript' },
  });
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  fireEvent.change(document.querySelector('input[accept*=".mp4"]')!, {
    target: { files: [new File(['audio'], 'pending.wav')] },
  });
  const recording = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(recording);
  expect(recording.defaultPrevented).toBe(true);
});

it.each(['en', 'sr-Latn'])(
  'keeps a failed participant name ready for retry in New/Edit in %s',
  async (language) => {
    await i18n.changeLanguage(language);
    for (const value of [undefined, round]) {
      contactCreate = async () => {
        throw new Error('Offline');
      };
      const save = show(value);
      await screen.findByLabelText(i18n.t('Notes'));
      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('tasks.addParticipant') })
      );
      const input = screen.getByPlaceholderText(i18n.t('tasks.selectContact'));
      const name = value ? 'Mira Čć Šž Đđ' : 'Jana Čć Šž Đđ';
      fireEvent.change(input, { target: { value: name } });
      fireEvent.click(
        await screen.findByRole('option', {
          name: i18n.t('kit.createName', { name }),
        })
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        i18n.t('tasks.loadFailed')
      );
      expect(input).toHaveValue(name);
      contactCreate = undefined;
      fireEvent.focus(input);
      fireEvent.click(
        await screen.findByRole('option', {
          name: i18n.t('kit.createName', { name }),
        })
      );
      await screen.findByRole('link', { name });
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t(value ? 'Save' : 'Add Round'),
        })
      );
      await waitFor(() => expect(save).toHaveBeenCalledOnce());
      expect(writes.at(-1)?.data.contact_ids).toEqual(['created-contact']);
      cleanup();
      contacts = [];
      queryClient.clear();
    }
  }
);

it.each(['en', 'sr-Latn'])(
  'translates New/Edit network failures and keeps the draft in %s',
  async (language) => {
    await i18n.changeLanguage(language);
    const normal = api.defaults.adapter as AxiosAdapter;
    for (const value of [undefined, round]) {
      api.defaults.adapter = async (config) => {
        if (config.method !== 'get' && config.url?.includes('round'))
          throw new AxiosError('Network Error', 'ERR_NETWORK', config);
        return normal(config);
      };
      const save = show(value);
      await screen.findByLabelText(i18n.t('Notes'));
      await waitFor(() =>
        expect(
          screen.getByRole('combobox', { name: i18n.t('Round Type') })
        ).toHaveTextContent('Technical')
      );
      fireEvent.change(screen.getByLabelText(i18n.t('Notes')), {
        target: { value: 'Retained note' },
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t(value ? 'Save' : 'Add Round'),
        })
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        i18n.t('error.request_failed')
      );
      expect(screen.getByRole('alert')).not.toHaveTextContent('Network Error');
      expect(screen.getByLabelText(i18n.t('Notes'))).toHaveValue(
        'Retained note'
      );
      api.defaults.adapter = normal;
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t(value ? 'Save' : 'Add Round'),
        })
      );
      await waitFor(() => expect(save).toHaveBeenCalledOnce());
      cleanup();
      queryClient.clear();
    }
  }
);

it('bounds fieldsets around long pending recording and transcript filenames', async () => {
  show();
  await screen.findByLabelText('Notes');
  const media = screen
    .getByRole('button', { name: 'Add Media' })
    .parentElement!.querySelector('input')!;
  fireEvent.change(media, {
    target: { files: [new File(['audio'], 'N'.repeat(190) + '.wav')] },
  });
  const filename = screen.getByText('N'.repeat(190) + '.wav');
  expect(filename.closest('fieldset')).toHaveClass('min-w-0');
  fireEvent.click(screen.getByRole('button', { name: 'Add transcript' }));
  const file = screen
    .getByRole('button', { name: 'Choose transcript file' })
    .parentElement!.querySelector('input')!;
  fireEvent.change(file, {
    target: { files: [new File(['WEBVTT'], 'T'.repeat(180) + '.vtt')] },
  });
  expect(
    screen.getByText('T'.repeat(180) + '.vtt').closest('fieldset')
  ).toHaveClass('min-w-0');
});
