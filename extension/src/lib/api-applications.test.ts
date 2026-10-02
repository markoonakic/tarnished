import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkExistingApplication,
  convertLeadToApplication,
} from './api-applications';

vi.mock('./logger', () => ({ debug: vi.fn(), warn: vi.fn() }));
vi.mock('./storage', () => ({
  getSettings: async () => ({
    appUrl: 'https://fixture.invalid',
    apiKey: 'test-only',
  }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('application requests', () => {
  it.each(['2026-01-01T01:30:00Z', '2026-01-01T23:30:00Z'])(
    'defers conversion dates to the server with browser timezone at %s',
    async (instant) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(instant));
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}'));
      await convertLeadToApplication('lead-1');
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe('https://fixture.invalid/api/job-leads/lead-1/convert');
      expect(new Headers(request?.headers).get('Time-Zone')).toBe(
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      expect(JSON.parse(String(request?.body || '{}'))).not.toHaveProperty(
        'applied_at'
      );
    }
  );

  it('only returns an exact URL match', async () => {
    const url = 'https://jobs.invalid/role?ref=1';
    const exact = { id: 'app-1', job_url: url };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ id: 'other', job_url: 'https://other.invalid' }, exact],
        })
      )
    );
    expect(await checkExistingApplication(url)).toEqual(exact);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://fixture.invalid/api/applications?url=${encodeURIComponent(url)}`
    );
  });

  it('returns null when the duplicate check fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch')
    );
    expect(
      await checkExistingApplication('https://jobs.invalid/role')
    ).toBeNull();
  });
});
