import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateImport = vi.fn();
const importData = vi.fn();
const connectToImportProgress = vi.fn();

vi.mock('../lib/import', () => ({
  validateImport,
  importData,
  connectToImportProgress,
}));

describe('ImportModal file limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts ZIP files larger than 100MB when still within backend archive limits', async () => {
    const { default: ImportModal } = await import('./ImportModal');

    render(<ImportModal isOpen onClose={() => {}} onSuccess={() => {}} />);

    const file = new File(['zip'], 'large-import.zip', {
      type: 'application/zip',
    });
    Object.defineProperty(file, 'size', { value: 150 * 1024 * 1024 });

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.queryByText(/File too large/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Validate' })
    ).toBeInTheDocument();
  });
});
