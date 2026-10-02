import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../../lib/api';
import type { ApplicationStatusHistory } from '../../lib/types';
import HistoryEvidenceDetails from './HistoryEvidenceDetails';

const { preferences } = vi.hoisted(() => ({
  preferences: { time_zone_mode: 'manual', time_zone: 'UTC' },
}));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({ data: preferences }),
}));
const entry: ApplicationStatusHistory = {
  id: 'event',
  from_status: {
    id: 'screen',
    name: 'Screening',
    meaning: 'screening',
    color: '#abc',
  },
  to_status: {
    id: 'applied',
    name: 'Applied',
    meaning: 'applied',
    color: '#def',
  },
  from_meaning: 'unknown',
  to_meaning: 'applied',
  from_meaning_provenance: 'legacy_unknown',
  to_meaning_provenance: 'recorded',
  time_provenance: 'legacy_unknown',
  changed_at: '2026-01-03T09:00:17Z',
  is_gap: false,
  note: 'Original note',
  corrected_at: null,
  correction_note: null,
};
const original = api.defaults.adapter;
let requests: InternalAxiosRequestConfig[];
let fail: boolean;
beforeEach(() => {
  requests = [];
  fail = false;
  preferences.time_zone = 'UTC';
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.defaults.adapter = async (config) => {
    requests.push(config);
    if (config.method === 'patch' && fail)
      throw new AxiosError('Conflict', undefined, config, undefined, {
        status: 409,
        data: { detail: 'changed' },
        statusText: 'Conflict',
        headers: {},
        config,
      });
    const data =
      config.method === 'get'
        ? config.url?.endsWith('/history')
          ? [{ ...entry, to_meaning: 'screening' }]
          : { evidence_revision: 8 }
        : {};
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
});
afterEach(() => {
  cleanup();
  api.defaults.adapter = original;
  vi.restoreAllMocks();
});
async function open(onChanged = vi.fn()) {
  const view = render(
    <HistoryEvidenceDetails
      entry={entry}
      applicationId="app"
      revision={7}
      onChanged={onChanged}
      editable
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit event' }));
  await screen.findByRole('dialog', { name: 'Edit history event' });
  return view;
}
function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

it('saves only changed facts without confirming an unchanged unknown stage or date', async () => {
  const changed = vi.fn();
  await open(changed);
  expect(
    screen.queryByText(/Historical meaning|Event event|legacy_unknown/)
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('combobox', { name: 'Previous recorded stage' })
  ).toHaveTextContent('Not recorded');
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  choose('Recorded stage', 'Interviewing');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  const patches = requests.filter((r) => r.method === 'patch');
  expect(patches).toHaveLength(1);
  expect(patches[0].url).toBe('/api/applications/app/history/event');
  expect(JSON.parse(patches[0].data)).toEqual({
    expected_revision: 7,
    to_meaning: 'interviewing',
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('uses the recorded historical stage rather than a renamed current definition and keeps initial unknown facts unconfirmed', async () => {
  const historical = {
    ...entry,
    id: 'identified',
    from_status: null,
    from_meaning: null,
    to_status: {
      ...entry.to_status!,
      name: 'Renamed label',
      meaning: 'offer' as const,
    },
    to_meaning: 'interviewing' as const,
    to_meaning_provenance: 'legacy_unknown' as const,
  };
  const changed = vi.fn();
  render(
    <HistoryEvidenceDetails
      entry={historical}
      applicationId="app"
      revision={7}
      onChanged={changed}
      editable
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit event' }));
  expect(
    await screen.findByRole('combobox', { name: 'Recorded stage' })
  ).toHaveTextContent('Interviewing');
  expect(
    screen.queryByRole('combobox', { name: 'Previous recorded stage' })
  ).not.toBeInTheDocument();
  choose('Recorded stage', 'Rejected');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  const patch = requests.find((request) => request.method === 'patch')!;
  expect(patch.url).toBe('/api/applications/app/history/identified');
  expect(JSON.parse(patch.data)).toEqual({
    expected_revision: 7,
    to_meaning: 'rejected',
  });
});

it('submits stage and selected-zone time changes atomically with a reason', async () => {
  preferences.time_zone = 'America/New_York';
  await open();
  const time = screen.getByLabelText('Date and time (America/New_York)');
  expect(time).toHaveValue('2026-01-03T04:00:17.000');
  choose('Previous recorded stage', 'Screening');
  choose('Recorded stage', 'Interviewing');
  fireEvent.change(time, { target: { value: '2026-01-05T11:30:17' } });
  fireEvent.change(screen.getByLabelText('Reason for correction (optional)'), {
    target: { value: 'Corrected from calendar' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(requests.filter((r) => r.method === 'patch')).toHaveLength(1)
  );
  expect(JSON.parse(requests.find((r) => r.method === 'patch')!.data)).toEqual({
    expected_revision: 7,
    from_meaning: 'screening',
    to_meaning: 'interviewing',
    changed_at: '2026-01-05T16:30:17.000Z',
    correction_note: 'Corrected from calendar',
  });
});

it.each([
  ['America/New_York', '2026-03-08T02:30', /does not exist/],
  ['America/New_York', '2025-11-02T01:30', /occurs twice/],
  ['Australia/Lord_Howe', '2026-04-05T01:45', /occurs twice/],
])(
  'keeps an invalid or ambiguous clock-change draft in %s',
  async (zone, value, message) => {
    preferences.time_zone = zone;
    await open();
    fireEvent.change(screen.getByLabelText(`Date and time (${zone})`), {
      target: { value },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(requests.filter((r) => r.method === 'patch')).toHaveLength(0);
  }
);

it('keeps a conflict draft and its original revision until an explicit reload', async () => {
  const view = await open();
  choose('Recorded stage', 'Interviewing');
  view.rerender(
    <HistoryEvidenceDetails
      entry={{ ...entry, to_meaning: 'screening' }}
      applicationId="app"
      revision={8}
      onChanged={vi.fn()}
      editable
    />
  );
  fail = true;
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your draft is kept'
  );
  expect(
    screen.getByRole('combobox', { name: 'Recorded stage' })
  ).toHaveTextContent('Interviewing');
  expect(
    JSON.parse(requests.find((r) => r.method === 'patch')!.data)
      .expected_revision
  ).toBe(7);
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved entry' }));
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Recorded stage' })
    ).toHaveTextContent('Screening')
  );
  choose('Recorded stage', 'Interviewing');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(requests.filter((r) => r.method === 'patch')).toHaveLength(2)
  );
  expect(
    JSON.parse(requests.filter((r) => r.method === 'patch')[1].data)
  ).toEqual({ expected_revision: 8, to_meaning: 'interviewing' });
});

it('does not expose editing for a removed history boundary', () => {
  const { container } = render(
    <HistoryEvidenceDetails
      entry={{ ...entry, is_gap: true }}
      applicationId="app"
      revision={7}
      editable
    />
  );
  expect(within(container).queryByRole('button')).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});
