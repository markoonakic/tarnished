import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractJobLead, getJobLead, saveJobLead } from './api-job-leads';
import { DuplicateLeadError } from './api-core';

vi.mock('./logger', () => ({ debug: vi.fn(), warn: vi.fn() }));
vi.mock('./storage', () => ({
  getSettings: async () => ({
    appUrl: 'https://fixture.invalid',
    apiKey: 'test-only',
  }),
}));
afterEach(() => vi.restoreAllMocks());

describe('job lead capture requests', () => {
  it('plain save only posts bounded source to job leads and does not invoke extraction', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'saved-1' }), { status: 201 })
      );
    const text = '<script>untrusted()</script>' + 'x'.repeat(110_000);
    expect(await saveJobLead('https://fixture.invalid/job', text)).toEqual({
      id: 'saved-1',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://fixture.invalid/api/job-leads');
    expect(request?.method).toBe('POST');
    expect(JSON.parse(String(request?.body))).toEqual({
      url: 'https://fixture.invalid/job',
      text: text.slice(0, 100_000),
    });
  });
  it('supports URL-only capture', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));
    await saveJobLead('https://fixture.invalid/job');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      url: 'https://fixture.invalid/job',
      text: '',
    });
  });
  it('retains the structured duplicate ID even when the message has no ID', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            code: 'DUPLICATE_RESOURCE',
            id: 'owned-lead-1',
            message: 'Already saved',
          },
        }),
        { status: 409 }
      )
    );
    await expect(
      saveJobLead('https://fixture.invalid/job')
    ).rejects.toMatchObject({ existingId: 'owned-lead-1' });
  });
  it('retains legacy duplicate IDs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            code: 'DUPLICATE_RESOURCE',
            detail: 'ID: abc-123',
            message: 'Already saved',
          },
        }),
        { status: 409 }
      )
    );
    await expect(saveJobLead('https://fixture.invalid/job')).rejects.toEqual(
      expect.objectContaining({ existingId: 'abc-123' })
    );
  });
  it('does not mistake a revision conflict for a duplicate', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: { id: 'saved-1', message: 'Changed; reload before retrying' },
        }),
        { status: 409 }
      )
    );
    try {
      await extractJobLead('saved-1', 3);
      throw new Error('expected conflict');
    } catch (error) {
      expect(error).not.toBeInstanceOf(DuplicateLeadError);
      expect(error).toMatchObject({ status: 409 });
    }
  });
  it('explicit extraction carries revision and browser timezone, never restart acknowledgement', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{}'));
    await getJobLead('lead-1');
    await extractJobLead('lead-1', 3);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://fixture.invalid/api/job-leads/lead-1'
    );
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toBe('https://fixture.invalid/api/job-leads/lead-1/extract');
    const headers = new Headers(request?.headers);
    expect(headers.get('X-API-Key')).toBe('test-only');
    expect(headers.get('Time-Zone')).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    expect(JSON.parse(String(request?.body))).toEqual({ expected_revision: 3 });
  });
});
