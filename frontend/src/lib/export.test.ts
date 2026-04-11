import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('./api', () => ({
  default: {
    get,
    post,
  },
}));

describe('export api helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('starts an async ZIP export job', async () => {
    post.mockResolvedValueOnce({ data: { job_id: 'job-1', status: 'queued' } });

    const { startZIPExportJob } = await import('./export');

    await startZIPExportJob();

    expect(post).toHaveBeenCalledWith('/api/export/zip-jobs');
  });

  it('fetches ZIP export job status', async () => {
    get.mockResolvedValueOnce({
      data: { job_id: 'job-1', status: 'processing' },
    });

    const { getZIPExportJobStatus } = await import('./export');

    await getZIPExportJobStatus('job-1');

    expect(get).toHaveBeenCalledWith('/api/export/zip-jobs/job-1');
  });

  it('downloads a completed ZIP export job', async () => {
    get.mockResolvedValueOnce({ data: new Blob(['zip']), headers: {} });

    const { downloadZIPExportJob } = await import('./export');

    await downloadZIPExportJob('job-1');

    expect(get).toHaveBeenCalledWith('/api/export/zip-jobs/job-1/download', {
      responseType: 'blob',
    });
  });
});
