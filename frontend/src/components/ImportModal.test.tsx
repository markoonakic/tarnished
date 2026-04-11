import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateImport = vi.fn();
const importData = vi.fn();
const connectToImportProgress = vi.fn();

vi.mock('../lib/import', () => ({
  validateImport,
  importData,
  connectToImportProgress,
}));

describe('ImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
