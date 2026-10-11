import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  startZIPExportJob,
  getZIPExportJobStatus,
  downloadZIPExportJob,
} from '@/lib/export';
import SettingsExport from './SettingsExport';
vi.mock('@/lib/export', () => ({
  startZIPExportJob: vi.fn(),
  getZIPExportJobStatus: vi.fn(),
  downloadZIPExportJob: vi.fn(),
  exportJSON: vi.fn(),
  exportCSV: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it.each(['status', 'download'])(
  'recovers the same ZIP job after a failed %s request',
  async (failure) => {
    vi.mocked(startZIPExportJob).mockResolvedValue({
      job_id: 'same-job',
      status: 'queued',
    });
    const complete = { job_id: 'same-job', status: 'complete', percent: 100 };
    if (failure === 'status')
      vi.mocked(getZIPExportJobStatus)
        .mockResolvedValueOnce({
          job_id: 'same-job',
          status: 'processing',
          stage: 'exporting',
          percent: 20,
        })
        .mockRejectedValueOnce(new Error('Offline'))
        .mockResolvedValue(complete);
    else {
      vi.mocked(getZIPExportJobStatus).mockResolvedValue(complete);
      vi.mocked(downloadZIPExportJob).mockRejectedValueOnce(
        new Error('Offline')
      );
    }
    render(
      <MemoryRouter>
        <SettingsExport />
      </MemoryRouter>
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Export ZIP (with files)' })
      )
    );
    if (failure === 'status')
      await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByText('Failed to export data')).toBeVisible();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Retry export' }))
    );
    expect(startZIPExportJob).toHaveBeenCalledOnce();
    expect(getZIPExportJobStatus).toHaveBeenLastCalledWith('same-job');
    expect(downloadZIPExportJob).toHaveBeenLastCalledWith('same-job');
    expect(screen.queryByText('Failed to export data')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export ZIP (with files)' })
    ).toBeEnabled();
  }
);
