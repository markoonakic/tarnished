import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryRouter } from 'react-router-dom';
import api from '@/lib/api';
import { createApplication } from '@/lib/applications';
import type { Status } from '../lib/types';
import ApplicationModal from './ApplicationModal';

const { listStatuses } = vi.hoisted(() => ({
  listStatuses: vi.fn(),
}));

vi.mock('../lib/settings', () => ({
  listStatuses,
}));

vi.mock('./CompanyPicker', () => ({
  default: ({
    id,
    name,
    onChange,
    disabled,
  }: {
    id: string;
    name: string;
    onChange: (id: string | null, name: string) => void;
    disabled?: boolean;
  }) => (
    <input
      id={id}
      value={name}
      disabled={disabled}
      onChange={(event) => onChange(null, event.target.value)}
    />
  ),
}));

vi.mock('../lib/applications', () => ({
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { post: vi.fn(), get: vi.fn().mockResolvedValue({ data: [] }) },
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

  it.each(['capture', 'manual'])(
    'locks the competing %s save until the first request ends',
    async (first) => {
      listStatuses.mockResolvedValue([
        {
          id: 'applied',
          name: 'Applied',
          meaning: 'applied',
          color: '#00ff00',
        },
      ]);
      const pending = createDeferredPromise<{ id: string }>();
      vi.mocked(createApplication).mockReturnValueOnce(
        pending.promise as ReturnType<typeof createApplication>
      );
      vi.mocked(api.post).mockImplementationOnce(async () => ({
        data: await pending.promise,
      }));
      const close = vi.fn();
      render(
        <MemoryRouter>
          <ApplicationModal isOpen onClose={close} onSuccess={vi.fn()} />
        </MemoryRouter>
      );
      await waitFor(() =>
        expect(
          screen.getByRole('combobox', { name: /status/i })
        ).toHaveTextContent('Applied')
      );
      fireEvent.change(screen.getByLabelText(/company/i), {
        target: { value: 'Manual company' },
      });
      fireEvent.change(screen.getByLabelText(/job title/i), {
        target: { value: 'Manual title' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'New application from URL or text' })
      );
      fireEvent.click(screen.getByRole('radio', { name: 'Paste text' }));
      fireEvent.change(screen.getByLabelText('Posting text'), {
        target: { value: 'Separate posting' },
      });
      const capture = screen.getByRole('button', { name: 'Save and review' });
      const manual = screen.getByRole('button', { name: 'Add Application' });
      fireEvent.click(first === 'capture' ? capture : manual);
      expect(first === 'capture' ? manual : capture).toBeDisabled();
      fireEvent.submit(manual.closest('form')!);
      fireEvent.click(capture);
      expect(
        first === 'capture' ? createApplication : api.post
      ).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      await act(async () => pending.resolve({ id: 'saved' }));
      expect(close).toHaveBeenCalledOnce();
    }
  );

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
