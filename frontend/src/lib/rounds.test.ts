import { afterEach, expect, it, vi } from 'vitest';
import api from './api';
import { deleteRound } from './rounds';
import { apiV030 } from './apiV030';
import type { Round } from './types';
vi.mock('./api', () => ({
  default: { delete: vi.fn().mockResolvedValue({}) },
}));
vi.mock('./queryClient', () => ({ invalidateEvidenceQueries: vi.fn() }));
afterEach(() => vi.clearAllMocks());
it('both delete entry points send the displayed revision, transcript and recording generations', async () => {
  const row = {
    revision: 4,
    media_generation: 5,
    transcript_generation: 6,
  } as Round;
  await deleteRound('round', row);
  await apiV030.deleteInterview('round', row);
  for (const call of vi.mocked(api.delete).mock.calls) {
    expect(call).toEqual([
      '/api/rounds/round',
      {
        params: { expected_revision: 4 },
        headers: {
          'Expected-Transcript-Generation': 6,
          'Expected-Media-Generation': 5,
        },
      },
    ]);
  }
  expect(api.delete).toHaveBeenCalledTimes(2);
});
