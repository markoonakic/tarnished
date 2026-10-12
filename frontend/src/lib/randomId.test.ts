import { afterEach, expect, it, vi } from 'vitest';
import { randomId } from './randomId';

const v4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

it('returns a v4 id', () => {
  expect(randomId()).toMatch(v4);
});

it('works without crypto.randomUUID (plain-HTTP origins)', () => {
  const real = globalThis.crypto;
  vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
  const ids = new Set(Array.from({ length: 50 }, () => randomId()));
  expect(ids.size).toBe(50);
  for (const id of ids) expect(id).toMatch(v4);
});
