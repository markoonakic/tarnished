import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validateImport = vi.fn();
const importData = vi.fn();
const connectToImportProgress = vi.fn();
const getImportStatus = vi.fn();

vi.mock('../lib/import', () => ({
  validateImport,
  importData,
  connectToImportProgress,
  getImportStatus,
}));

afterEach(cleanup);

describe('ImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks an interrupted import without submitting the archive again', async () => {
    validateImport.mockResolvedValue({
      valid: true,
      summary: {},
      warnings: [],
      errors: [],
    });
    importData.mockResolvedValue({ import_id: 'job-1' });
    connectToImportProgress.mockImplementation(
      (_id, _onProgress, onTerminal) => {
        onTerminal({
          status: 'unknown',
          percent: 0,
          message: 'Connection lost',
        });
        return { close: vi.fn() };
      }
    );
    getImportStatus.mockResolvedValue({ status: 'complete', percent: 100 });
    const { default: ImportModal } = await import('./ImportModal');
    const success = vi.fn();
    render(<ImportModal isOpen onClose={vi.fn()} onSuccess={success} />);
    fireEvent.change(screen.getByLabelText('ZIP archive'), {
      target: { files: [new File(['zip'], 'backup.ZIP')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await screen.findByText('Import Summary');
    fireEvent.click(screen.getByRole('button', { name: 'Import Data' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check import status' })
    );
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(getImportStatus).toHaveBeenCalledWith('job-1');
    expect(importData).toHaveBeenCalledOnce();
  });

  it('does not allow closing or replacing the archive during validation', async () => {
    let resolve!: (value: unknown) => void;
    validateImport.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const { default: ImportModal } = await import('./ImportModal');
    const close = vi.fn();
    render(<ImportModal isOpen onClose={close} onSuccess={vi.fn()} />);
    const input = screen.getByLabelText('ZIP archive');
    fireEvent.change(input, {
      target: { files: [new File(['zip'], 'backup.zip')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close modal' })).toBeDisabled();
    await act(async () =>
      resolve({ valid: true, summary: {}, warnings: [], errors: [] })
    );
    expect(close).not.toHaveBeenCalled();
  });

  it('renders processing progress from backend job updates after import starts', async () => {
    validateImport.mockResolvedValue({
      valid: true,
      summary: {
        applications: 1,
        rounds: 0,
        status_history: 0,
        custom_statuses: 0,
        custom_round_types: 0,
        files: 0,
      },
      warnings: [],
      errors: [],
    });
    importData.mockResolvedValue({ import_id: 'job-1', status: 'queued' });
    connectToImportProgress.mockImplementation((_id, onProgress) => {
      onProgress({
        status: 'processing',
        stage: 'extracting',
        percent: 30,
        message: 'Extracting files...',
      });
      return { close() {} };
    });

    const { default: ImportModal } = await import('./ImportModal');

    render(<ImportModal isOpen onClose={() => {}} onSuccess={() => {}} />);

    const file = new File(['zip'], 'import.zip', { type: 'application/zip' });
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await screen.findByText('Import Summary');

    fireEvent.click(screen.getByRole('button', { name: 'Import Data' }));

    await waitFor(() => {
      expect(screen.getByText('Extracting files...')).toBeInTheDocument();
    });

    const progress = document.querySelector('[role="progressbar"]');
    expect(progress).not.toBeNull();
    expect(progress).toHaveAttribute('aria-valuenow', '30');
  });
});
