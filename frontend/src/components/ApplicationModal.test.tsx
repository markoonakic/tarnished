import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Status } from '../lib/types';
import ApplicationModal from './ApplicationModal';

const { listStatuses } = vi.hoisted(() => ({
  listStatuses: vi.fn(),
}));

vi.mock('../lib/settings', () => ({
  listStatuses,
}));

vi.mock('../lib/applications', () => ({
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
}));

function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('ApplicationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves typed create-mode fields when statuses finish loading', async () => {
    const pendingStatuses = createDeferredPromise<Status[]>();
    listStatuses.mockReturnValueOnce(pendingStatuses.promise);

    render(<ApplicationModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

    const companyInput = screen.getByLabelText(/company/i);
    fireEvent.change(companyInput, { target: { value: 'Acme' } });

    expect(companyInput).toHaveValue('Acme');

    pendingStatuses.resolve([
      {
        id: 'status-applied',
        name: 'Applied',
        color: '#0f0',
      },
    ]);

    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: /status/i })
      ).toHaveTextContent('Applied')
    );

    expect(companyInput).toHaveValue('Acme');
  });
});
