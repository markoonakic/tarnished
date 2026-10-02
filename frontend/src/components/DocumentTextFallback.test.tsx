import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../lib/api';
import DocumentTextFallback from './DocumentTextFallback';

const original = api.defaults.adapter;
let reads: {
  resolve: (value: AxiosResponse) => void;
  reject: (error: Error) => void;
  config: InternalAxiosRequestConfig;
}[];
let writes: InternalAxiosRequestConfig[];
beforeEach(() => {
  reads = [];
  writes = [];
  api.defaults.adapter = (config) => {
    if (config.method === 'put') {
      writes.push(config);
      return Promise.resolve({
        data: { text: JSON.parse(config.data).text, revision: 9 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    }
    return new Promise((resolve, reject) =>
      reads.push({ resolve, reject, config })
    );
  };
});
afterEach(() => {
  cleanup();
  api.defaults.adapter = original;
});
async function resolveRead(index: number, revision = 4) {
  await act(async () => {
    reads[index].resolve({
      data: { text: `Saved ${revision}`, revision },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: reads[index].config,
    });
  });
}
function openText() {
  if (!screen.queryByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: 'Use CV text' }));
}
function typeDraft(text = 'New unsaved draft') {
  openText();
  fireEvent.change(screen.getByLabelText('CV pasted text'), {
    target: { value: text },
  });
}
function reload() {
  openText();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Refresh saved CV text (keep draft)',
    })
  );
}

it('opens text editing on request and keeps an unsaved draft when closed', async () => {
  render(<DocumentTextFallback applicationId="app" kind="cv" revision={4} />);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await waitFor(() => expect(reads).toHaveLength(1));
  await resolveRead(0);
  typeDraft('Keep this draft');
  fireEvent.click(screen.getByRole('button', { name: 'Close document text' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  openText();
  expect(screen.getByLabelText('CV pasted text')).toHaveValue(
    'Keep this draft'
  );
  expect(writes).toHaveLength(0);
});

it('notifies the application when saved text changes its evidence revision', async () => {
  const onSaved = vi.fn();
  render(
    <DocumentTextFallback
      applicationId="app"
      kind="cv"
      revision={4}
      onSaved={onSaved}
    />
  );
  await waitFor(() => expect(reads).toHaveLength(1));
  await resolveRead(0);
  typeDraft();
  fireEvent.click(screen.getByRole('button', { name: 'Save CV text' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(9));
});

it.each([
  ['initial', 6],
  ['reload', 5],
  ['source-refresh', 4],
  ['dirty-source-refresh', 4],
  ['dirty-source-refresh-then-reload', 6],
] as const)(
  'DocumentTextFallback preserves its draft and write revision through %s',
  async (mode, expectedRevision) => {
    const view = render(
      <DocumentTextFallback applicationId="app" kind="cv" revision={4} />
    );
    await waitFor(() => expect(reads).toHaveLength(1));
    let pending = 0;
    const alreadyDirty = mode.startsWith('dirty-');
    if (mode !== 'initial') {
      await resolveRead(0);
      if (alreadyDirty) typeDraft();
      if (mode === 'reload') reload();
      else
        view.rerender(
          <DocumentTextFallback applicationId="app" kind="cv" revision={5} />
        );
      await waitFor(() => expect(reads).toHaveLength(2));
      pending = 1;
    }
    if (!alreadyDirty) typeDraft();
    await resolveRead(pending, 5);
    expect(screen.getByLabelText('CV pasted text')).toHaveValue(
      'New unsaved draft'
    );
    expect(reads).toHaveLength(pending + 1); // no keystroke-triggered reads
    expect(writes).toHaveLength(0);
    if (mode === 'initial' || mode === 'dirty-source-refresh-then-reload') {
      if (mode === 'initial')
        expect(
          screen.getByRole('button', { name: 'Save CV text' })
        ).toBeDisabled();
      reload();
      await waitFor(() => expect(reads).toHaveLength(pending + 2));
      await resolveRead(pending + 1, 6);
      expect(screen.getByLabelText('CV pasted text')).toHaveValue(
        'New unsaved draft'
      );
      expect(writes).toHaveLength(0);
    }
    expect(reads.every(({ config }) => config.method === 'get')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save CV text' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0].data)).toEqual({
      text: 'New unsaved draft',
      expected_revision: expectedRevision,
    });
  }
);

it.each(['success', 'error'])(
  'DocumentTextFallback ignores obsolete read %s and keeps explicit reload ownership',
  async (outcome) => {
    const view = render(
      <DocumentTextFallback applicationId="app" kind="cv" revision={4} />
    );
    await waitFor(() => expect(reads).toHaveLength(1));
    reload();
    await waitFor(() => expect(reads).toHaveLength(2));
    view.rerender(
      <DocumentTextFallback applicationId="app" kind="cv" revision={5} />
    );
    await waitFor(() => expect(reads).toHaveLength(3));
    typeDraft();
    if (outcome === 'success') await resolveRead(1, 8);
    else await act(async () => reads[1].reject(new Error('obsolete failure')));
    await resolveRead(2, 7);
    expect(screen.getByLabelText('CV pasted text')).toHaveValue(
      'New unsaved draft'
    );
    // The now-obsolete explicit request must not authorize a later background rebase.
    expect(screen.getByRole('button', { name: 'Save CV text' })).toBeDisabled();
    expect(
      screen.queryByText('Cannot load saved document text. Your draft is kept.')
    ).not.toBeInTheDocument();
    reload();
    await waitFor(() => expect(reads).toHaveLength(4));
    await resolveRead(3, 9);
    expect(screen.getByLabelText('CV pasted text')).toHaveValue(
      'New unsaved draft'
    );
    expect(screen.getByRole('button', { name: 'Save CV text' })).toBeEnabled();
    await resolveRead(0);
    expect(screen.getByLabelText('CV pasted text')).toHaveValue(
      'New unsaved draft'
    );
  }
);

it.each(['success', 'error'])(
  'DocumentTextFallback ignores read %s superseded by an explicit save',
  async (outcome) => {
    render(<DocumentTextFallback applicationId="app" kind="cv" revision={4} />);
    await waitFor(() => expect(reads).toHaveLength(1));
    await resolveRead(0);
    reload();
    await waitFor(() => expect(reads).toHaveLength(2));
    typeDraft('Explicitly saved draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save CV text' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save CV text' })).toBeEnabled()
    );
    typeDraft('New typing after save');
    if (outcome === 'success') await resolveRead(1, 5);
    else await act(async () => reads[1].reject(new Error('obsolete failure')));
    expect(screen.getByLabelText('CV pasted text')).toHaveValue(
      'New typing after save'
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save CV text' }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(JSON.parse(writes[1].data).expected_revision).toBe(9);
  }
);
