import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  connectToImportProgress,
  getImportStatus,
  validateImport,
} from './import';
import api, { fetchWithAuth } from './api';
import { queryClient } from './queryClient';

vi.mock('./api', () => ({
  default: { get: vi.fn() },
  API_BASE: '',
  fetchWithAuth: vi.fn(),
  getAccessToken: vi.fn(),
  refreshAuthTokens: vi.fn(),
  buildAuthenticatedEventSourceUrl: (path: string) => path,
  safeErrorMessage: (detail: unknown, fallback: string) =>
    typeof detail === 'string' ? detail : fallback,
}));
vi.mock('./queryClient', () => ({
  invalidateEvidenceQueries: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));
class MockEventSource extends EventTarget {
  close = vi.fn();
  onerror: (() => void) | null = null;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('EventSource', MockEventSource);
});
afterEach(() => vi.unstubAllGlobals());

it('rejects invalid archives even when validation returns HTTP 200', async () => {
  vi.mocked(fetchWithAuth).mockResolvedValue(
    new Response(
      JSON.stringify({
        valid: false,
        summary: {},
        warnings: [],
        errors: ['Archive checksum does not match'],
      })
    )
  );
  await expect(validateImport(new File(['zip'], 'backup.zip'))).rejects.toThrow(
    'Archive checksum does not match'
  );
});

it.each(['error', 'timeout'])(
  'reports an unknown result when import progress ends with %s',
  (event) => {
    const terminal = vi.fn();
    const source = connectToImportProgress(
      'job-1',
      vi.fn(),
      terminal
    ) as unknown as MockEventSource;
    if (event === 'error') source.onerror?.();
    else source.dispatchEvent(new Event('timeout'));
    expect(source.close).toHaveBeenCalledOnce();
    expect(terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'unknown',
        message: expect.stringContaining('may still be running'),
      })
    );
  }
);

it('closes progress when the import completes', () => {
  const terminal = vi.fn();
  const source = connectToImportProgress(
    'job-1',
    vi.fn(),
    terminal
  ) as unknown as MockEventSource;
  source.dispatchEvent(
    new MessageEvent('progress', {
      data: JSON.stringify({ status: 'complete', percent: 100 }),
    })
  );
  expect(source.close).toHaveBeenCalledOnce();
  expect(terminal).toHaveBeenCalledWith({ status: 'complete', percent: 100 });
  expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ['user-preferences'],
  });
});

it('refreshes the restored language after a completed import status read', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { status: 'complete', percent: 100 },
  });
  await getImportStatus('job-1');
  expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ['user-preferences'],
  });
});
