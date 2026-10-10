import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ReminderModal from './ReminderModal';
import DocumentTextFallback from './DocumentTextFallback';
import ApplicationOtherFiles from './slots/ApplicationOtherFiles';
import { apiV030 } from '@/lib/apiV030';
import api from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import type { Application } from '@/lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  queryClient.clear();
});
function exitBlocked() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
it('keeps reminder Title, Date and Note on Reload before and during a save', async () => {
  const save = vi.fn(() => new Promise<void>(() => {}));
  render(<ReminderModal onSave={save} onClose={vi.fn()} />);
  expect(exitBlocked()).toBe(false);
  for (const [name, value] of [
    ['Title', 'Keep title'],
    ['Date', '2026-10-10'],
    ['Note (optional)', 'Keep note'],
  ])
    fireEvent.change(screen.getByLabelText(name), { target: { value } });
  expect(exitBlocked()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(exitBlocked()).toBe(true);
  expect(screen.getByLabelText('Title')).toHaveValue('Keep title');
  expect(screen.getByLabelText('Date')).toHaveValue('2026-10-10');
  expect(screen.getByLabelText('Note (optional)')).toHaveValue('Keep note');
});
it.each(['cv', 'cover_letter'] as const)(
  'protects %s text and pending saves; keeps guidance in a HelpTip',
  async (kind) => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { text: '', revision: 0 } });
    let finish!: (value: unknown) => void;
    vi.spyOn(api, 'put').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const label = kind === 'cv' ? 'CV' : 'Cover letter';
    render(
      <DocumentTextFallback
        applicationId={'app-' + kind}
        kind={kind}
        revision={0}
      />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: `Use ${label} text` }));
    const help = screen.getByRole('button', { name: `${label} text` });
    expect(
      screen.queryByText(/Paste text if you do not have a file/)
    ).not.toBeInTheDocument();
    fireEvent.focus(help);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Replacing the attachment clears saved text.'
    );
    fireEvent.blur(help);
    fireEvent.change(screen.getByLabelText(`${label} pasted text`), {
      target: { value: 'Keep entered text' },
    });
    expect(exitBlocked()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: `Save ${label} text` }));
    await waitFor(() => expect(api.put).toHaveBeenCalledOnce());
    expect(exitBlocked()).toBe(true);
    expect(screen.getByLabelText(`${label} pasted text`)).toHaveValue(
      'Keep entered text'
    );
    await act(async () =>
      finish({ data: { text: 'Keep entered text', revision: 1 } })
    );
    expect(exitBlocked()).toBe(false);
  }
);
it('keeps Other files selection and kind on Reload before and during upload', async () => {
  vi.spyOn(apiV030, 'attachments').mockResolvedValue([]);
  let finish!: (
    value: Awaited<ReturnType<typeof apiV030.uploadAttachment>>
  ) => void;
  vi.spyOn(apiV030, 'uploadAttachment').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  render(<ApplicationOtherFiles application={{ id: 'app' } as Application} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add file' }));
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: 'Portfolio' }));
  const file = new File(['Real portfolio'], 'portfolio.txt', {
    type: 'text/plain',
  });
  fireEvent.change(screen.getByLabelText('File'), {
    target: { files: [file] },
  });
  expect(exitBlocked()).toBe(true);
  fireEvent.submit(
    screen.getByRole('button', { name: 'Upload' }).closest('form')!
  );
  await waitFor(() =>
    expect(apiV030.uploadAttachment).toHaveBeenCalledWith(
      'app',
      'portfolio',
      file
    )
  );
  expect(exitBlocked()).toBe(true);
  expect((screen.getByLabelText('File') as HTMLInputElement).files?.[0]).toBe(
    file
  );
  await act(async () =>
    finish({
      id: 'file',
      user_id: 'owner',
      revision: 0,
      created_at: '2026-10-10T10:00:00Z',
      updated_at: '2026-10-10T10:00:00Z',
      application_id: 'app',
      kind: 'portfolio',
      original_filename: 'portfolio.txt',
      byte_count: 14,
      media_type: 'text/plain',
      sha256: 'fixture',
      uploaded_at: '2026-10-10T10:00:00Z',
    })
  );
  expect(exitBlocked()).toBe(false);
});
