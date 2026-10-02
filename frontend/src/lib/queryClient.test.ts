import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { invalidateEvidenceQueries } from './queryClient';

it('invalidates streak and evidence reads without discarding static flame assets', () => {
  const client = new QueryClient();
  const streak = ['streak', '2026-10-02'];
  const asset = ['flame-asset', 'dormant'];
  client.setQueryData(streak, { current_streak: 1 });
  client.setQueryData(asset, { frames: [] });
  invalidateEvidenceQueries(client);
  expect(client.getQueryState(streak)?.isInvalidated).toBe(true);
  expect(client.getQueryState(asset)?.isInvalidated).toBe(false);
  client.clear();
});
