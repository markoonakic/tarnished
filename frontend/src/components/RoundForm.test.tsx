import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import type { Round } from '@/lib/types';
import RoundForm from './RoundForm';
const round: Round = { id: 'round-1', revision: 3, round_type: { id: 'technical', name: 'Technical' }, scheduled_at: '2026-11-01T06:30:27Z', completed_at: null, time_zone: 'America/New_York', outcome: null, notes_summary: null, transcript_summary: null, transcript_path: null, transcript_original_filename: null, media: [], created_at: '2026-01-01T00:00Z' };
const adapter = api.defaults.adapter;
let writes: { method: string; data: Record<string, unknown> }[];
beforeEach(() => {
  writes = []; queryClient.clear();
  api.defaults.adapter = async (config) => {
    let data: unknown = round;
    if (config.url === '/api/user-preferences') data = { time_zone_mode: 'manual', time_zone: 'Europe/Belgrade' };
    if (config.url === '/api/round-types') data = [round.round_type];
    if (config.url === '/api/contacts') data = { items: [], total: 0 };
    if (config.method === 'post' || config.method === 'patch') { const input = JSON.parse(config.data); writes.push({ method: config.method, data: input }); data = { ...round, ...input }; }
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
});
afterEach(() => { cleanup(); queryClient.clear(); api.defaults.adapter = adapter; });
function show(value?: Round) {
  const save = vi.fn();
  render(<QueryClientProvider client={queryClient}><RoundForm applicationId="app-1" round={value} onSave={save} onPersist={vi.fn()} onCancel={vi.fn()} /></QueryClientProvider>);
  return save;
}
it('keeps an unchanged folded instant and seconds while saving interview metadata with the expected revision', async () => {
  const save = show(round);
  expect(await screen.findByLabelText('Scheduled Date')).toHaveValue('2026-11-01');
  expect(screen.getByLabelText('Time')).toHaveValue('01:30');
  fireEvent.change(screen.getByLabelText('Duration (minutes)'), { target: { value: '60' } });
  fireEvent.change(screen.getByLabelText('Meeting link'), { target: { value: 'https://example.com/meeting' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(writes[0].data).toMatchObject({ expected_revision: 3, time_zone: 'America/New_York', duration_minutes: 60, mode: 'video', meeting_url: 'https://example.com/meeting' });
  expect(writes[0].data).not.toHaveProperty('scheduled_at');
  expect(screen.queryByText('Choose recording...')).not.toBeInTheDocument();
});
it('creates a round with a UTC instant from the selected zone and does not start media or AI work', async () => {
  const save = show();
  await screen.findByLabelText('Scheduled Date');
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Round Type' })).toHaveTextContent('Technical'));
  fireEvent.change(screen.getByLabelText('Scheduled Date'), { target: { value: '2026-10-10' } });
  fireEvent.change(screen.getByLabelText('Time'), { target: { value: '15:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Round' }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ method: 'post', data: { scheduled_at: '2026-10-10T13:00:00.000Z', time_zone: 'Europe/Belgrade', round_type_id: 'technical' } });
});
it('rejects a nonexistent local time without a write and keeps the entered date', async () => {
  show(round);
  await screen.findByLabelText('Scheduled Date');
  fireEvent.change(screen.getByLabelText('Scheduled Date'), { target: { value: '2026-03-08' } });
  fireEvent.change(screen.getByLabelText('Time'), { target: { value: '02:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('does not exist');
  expect(writes).toHaveLength(0);
  expect(screen.getByLabelText('Scheduled Date')).toHaveValue('2026-03-08');
});
