import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

afterEach(cleanup);

describe('ApplicationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves typed create-mode fields when statuses finish loading', async () => {
    const pendingStatuses = createDeferredPromise<Status[]>();
    listStatuses.mockReturnValueOnce(pendingStatuses.promise);

    render(<ApplicationModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(
      screen.queryByText('Include rejections, but not automatic receipts.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Leave the date blank to use today in your effective time zone.'
      )
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'About employer replies' })
        .parentElement?.parentElement
    ).toHaveClass('flex', 'items-center');
    expect(
      screen.getByRole('button', { name: 'About applied dates' }).parentElement
        ?.parentElement
    ).toHaveClass('flex', 'items-center');
    fireEvent.click(
      screen.getByRole('button', { name: 'About employer replies' })
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Include rejections, but not automatic receipts.'
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'About employer replies' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'About applied dates' })
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Leave the date blank to use today in your effective time zone.'
    );
    const companyInput = screen.getByLabelText(/company/i);
    fireEvent.change(companyInput, { target: { value: 'Acme' } });

    expect(companyInput).toHaveValue('Acme');

    await act(async () => {
      pendingStatuses.resolve([
        {
          id: 'status-applied',
          name: 'Applied',
          meaning: 'applied',
          color: '#0f0',
        },
      ]);
      await pendingStatuses.promise;
    });

    expect(screen.getByRole('combobox', { name: /status/i })).toHaveTextContent(
      'Applied'
    );

    expect(companyInput).toHaveValue('Acme');
  });
});
