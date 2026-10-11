import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DeleteConfirm } from './RecordModals';

function protectedExit() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
afterEach(cleanup);
it.each(['company', 'contact', 'note', 'reminder'])(
  'guards confirmed %s deletion through its request and refresh',
  async (kind) => {
    let release!: () => void;
    const close = vi.fn();
    render(
      <DeleteConfirm
        message={kind}
        onClose={close}
        onDelete={() =>
          new Promise((resolve) => {
            release = resolve;
          })
        }
      />
    );
    expect(protectedExit()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(protectedExit()).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(close).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(protectedExit()).toBe(false);
  }
);
it('shows a failed delete and clears only the pending exit guard', async () => {
  const close = vi.fn();
  render(
    <DeleteConfirm
      message="Keep record"
      onClose={close}
      onDelete={async () => {
        throw new Error('Offline');
      }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await screen.findByRole('alert');
  expect(close).not.toHaveBeenCalled();
  expect(protectedExit()).toBe(false);
  expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
});
