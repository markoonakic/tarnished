import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TranscriptEditor from './TranscriptEditor';

const {
  getTranscript,
  editTranscript,
  pasteTranscript,
  uploadRoundTranscript,
  deleteRoundTranscript,
} = vi.hoisted(() => ({
  getTranscript: vi.fn(),
  editTranscript: vi.fn(),
  pasteTranscript: vi.fn(),
  uploadRoundTranscript: vi.fn(),
  deleteRoundTranscript: vi.fn(),
}));
vi.mock('../lib/transcripts', () => ({
  getTranscript,
  editTranscript,
  pasteTranscript,
}));
vi.mock('../lib/rounds', () => ({
  uploadRoundTranscript,
  deleteRoundTranscript,
  getRoundTranscriptSignedUrl: vi.fn(),
}));

const state = () => ({
  generation: 2,
  attachment_only: false,
  transcript: {
    id: 'transcript',
    revision: 1,
    provenance: 'paste',
    format: 'txt',
    segments: [
      {
        id: 'passage',
        text: '<script>literal source</script>',
        start: null,
        end: null,
        speaker: null,
        role: 'unknown',
      },
    ],
  },
});
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  getTranscript.mockResolvedValue(state());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

it('opens in reading mode and links to feedback without sending unsaved edits', async () => {
  const onFeedback = vi.fn();
  editTranscript.mockResolvedValue({ ...state(), generation: 3 });
  render(
    <TranscriptEditor
      roundId="round"
      onClose={vi.fn()}
      onChange={vi.fn()}
      onFeedback={onFeedback}
    />
  );
  await screen.findByText('<script>literal source</script>');
  expect(screen.queryByLabelText('Text for passage 1')).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      'Some speakers are unidentified. Identify your answers in Edit transcript for personal feedback.'
    )
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Correct text and speaker roles' })
  );
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Some speakers are unidentified. Identify your answers in Edit transcript for personal feedback.'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit transcript' }));
  fireEvent.change(screen.getByLabelText('Text for passage 1'), {
    target: { value: 'Draft' },
  });
  expect(
    screen.getByRole('button', { name: 'Interview feedback' })
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Read transcript' }));
  expect(screen.getByText('Draft')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Edit transcript' }));
  expect(screen.getByLabelText('Text for passage 1')).toHaveValue('Draft');
  fireEvent.click(screen.getByRole('button', { name: 'Save corrections' }));
  await screen.findByText('Transcript saved.');
  fireEvent.click(screen.getByRole('button', { name: 'Interview feedback' }));
  expect(onFeedback).toHaveBeenCalledOnce();
});

it('loads literal text and saves stable identities/unknown timing with assigned role', async () => {
  editTranscript.mockResolvedValue({ ...state(), generation: 3 });
  render(
    <TranscriptEditor roundId="round" onClose={vi.fn()} onChange={vi.fn()} />
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit transcript' })
  );
  const text = screen.getByLabelText('Text for passage 1');
  expect(text).toHaveValue('<script>literal source</script>');
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByText(/Timing unknown/)).toBeVisible();
  fireEvent.change(text, { target: { value: 'Corrected answer' } });
  fireEvent.click(screen.getByLabelText('Role for passage 1'));
  fireEvent.click(screen.getByRole('option', { name: 'Candidate' }));
  fireEvent.change(screen.getByLabelText('Speaker for passage 1'), {
    target: { value: 'Me' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save corrections' }));
  await waitFor(() =>
    expect(editTranscript).toHaveBeenCalledWith('round', 2, [
      {
        id: 'passage',
        text: 'Corrected answer',
        start: null,
        end: null,
        speaker: 'Me',
        role: 'candidate',
      },
    ])
  );
});

it('retains a conflicting draft and generation without serializing validation secrets', async () => {
  editTranscript.mockRejectedValue({
    isAxiosError: true,
    response: { status: 422, data: { detail: [{ input: 'secret-value' }] } },
  });
  render(
    <TranscriptEditor roundId="round" onClose={vi.fn()} onChange={vi.fn()} />
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit transcript' })
  );
  const text = screen.getByLabelText('Text for passage 1');
  fireEvent.change(text, { target: { value: 'Keep my draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save corrections' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your draft is retained'
  );
  expect(text).toHaveValue('Keep my draft');
  expect(document.body).not.toHaveTextContent('secret-value');
  expect(getTranscript).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Save corrections' }));
  await waitFor(() => expect(editTranscript).toHaveBeenCalledTimes(2));
  expect(editTranscript.mock.calls[1][1]).toBe(2);
});

it('pastes without AI and deletes with the returned generation', async () => {
  getTranscript.mockResolvedValue({
    generation: 0,
    transcript: null,
    attachment_only: false,
  });
  pasteTranscript.mockResolvedValue(state());
  let finishDelete!: () => void;
  deleteRoundTranscript.mockReturnValue(
    new Promise<void>((resolve) => {
      finishDelete = resolve;
    })
  );
  render(
    <TranscriptEditor roundId="round" onClose={vi.fn()} onChange={vi.fn()} />
  );
  await screen.findByText('No transcript yet.');
  fireEvent.change(screen.getByLabelText('Transcript text'), {
    target: { value: 'Supplied words' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Save pasted transcript' })
  );
  await waitFor(() =>
    expect(pasteTranscript).toHaveBeenCalledWith(
      'round',
      0,
      'Supplied words',
      'txt'
    )
  );
  await screen.findByText('Transcript saved.');
  fireEvent.click(screen.getByText('Transcript actions'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete transcript' }));
  expect(screen.getByText('Deleting transcript…')).toBeVisible();
  await waitFor(() =>
    expect(deleteRoundTranscript).toHaveBeenCalledWith('round', 2)
  );
  await act(async () => finishDelete());
  expect(await screen.findByText('No transcript yet.')).toBeVisible();
  expect(screen.getByText('Transcript deleted.')).toBeVisible();
});

it('keeps a selected upload after failure and does not silently refresh the revision', async () => {
  uploadRoundTranscript.mockRejectedValue(new Error('offline'));
  const { container } = render(
    <TranscriptEditor roundId="round" onClose={vi.fn()} onChange={vi.fn()} />
  );
  await screen.findByRole('button', { name: 'Edit transcript' });
  fireEvent.click(screen.getByText('Replace transcript'));
  const file = new File(['text'], 'supplied.txt', { type: 'text/plain' });
  fireEvent.change(container.querySelector('input[type=file]')!, {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Upload transcript' }));
  await screen.findByRole('alert');
  expect(screen.getByText('supplied.txt')).toBeVisible();
  expect(uploadRoundTranscript).toHaveBeenCalledWith(
    'round',
    file,
    undefined,
    2
  );
  expect(getTranscript).toHaveBeenCalledTimes(1);
});

it('ignores a late response after unmount and offers explicit retry after a read failure', async () => {
  getTranscript.mockRejectedValueOnce(new Error('offline'));
  const onChange = vi.fn();
  const { unmount } = render(
    <TranscriptEditor roundId="round" onClose={vi.fn()} onChange={onChange} />
  );
  await screen.findByRole('alert');
  let resolve!: (value: unknown) => void;
  getTranscript.mockReturnValueOnce(
    new Promise((res) => {
      resolve = res;
    })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  unmount();
  await act(async () => resolve(state()));
  expect(onChange).not.toHaveBeenCalled();
});

it('saving corrections does not discard a separate unsaved replacement draft', async () => {
  editTranscript.mockResolvedValue({ ...state(), generation: 3 });
  render(
    <TranscriptEditor roundId="round" onClose={vi.fn()} onChange={vi.fn()} />
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit transcript' })
  );
  fireEvent.click(screen.getByText('Replace transcript'));
  fireEvent.change(screen.getByLabelText('Transcript text'), {
    target: { value: 'Unsaved replacement material' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save corrections' }));
  await screen.findByText('Transcript saved.');
  expect(screen.getByLabelText('Transcript text')).toHaveValue(
    'Unsaved replacement material'
  );
});

it('shows automatic roles and full time ranges without requiring an edit before feedback', async () => {
  const onFeedback = vi.fn();
  getTranscript.mockResolvedValue({
    ...state(),
    transcript: {
      ...state().transcript,
      provenance: 'media',
      structure: 'automatic',
      structure_model: 'openai/test-text',
      segments: [
        {
          ...state().transcript.segments[0],
          role: 'interviewer',
          start: 0,
          end: 12.5,
        },
        {
          ...state().transcript.segments[0],
          id: 'answer',
          text: 'My answer.',
          role: 'candidate',
          start: 12.5,
          end: 90,
        },
        {
          ...state().transcript.segments[0],
          id: 'other',
          role: 'other',
          start: 90,
          end: 91,
        },
      ],
    },
  });
  render(
    <TranscriptEditor
      roundId="round"
      onClose={vi.fn()}
      onChange={vi.fn()}
      onFeedback={onFeedback}
    />
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Interview transcript' })
  );
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Parts and roles were assigned automatically. Edit only if something is wrong.'
  );
  expect(screen.getByText('Interviewer · 00:00–00:12')).toBeVisible();
  expect(screen.getByText('Candidate · 00:12–01:30')).toBeVisible();
  expect(screen.getByText('Other · 01:30–01:31')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Interview feedback' }));
  expect(onFeedback).toHaveBeenCalledOnce();
  expect(editTranscript).not.toHaveBeenCalled();
  expect(pasteTranscript).not.toHaveBeenCalled();
});

it('shows the safe structuring fallback and keeps unknown speech readable', async () => {
  getTranscript.mockResolvedValue({
    ...state(),
    transcript: {
      ...state().transcript,
      structure: 'none',
      structure_status: 'Automatic sections unavailable',
    },
  });
  render(
    <TranscriptEditor roundId="round" onClose={vi.fn()} onChange={vi.fn()} />
  );
  expect(
    await screen.findByText(/Automatic sections unavailable/)
  ).toBeVisible();
  expect(
    screen.getByText('Unknown · Timing unknown · Passage 1')
  ).toBeVisible();
  expect(screen.getByText('<script>literal source</script>')).toBeVisible();
  expect(editTranscript).not.toHaveBeenCalled();
});

it('shows a missing cited passage honestly without replacing the independent current transcript', async () => {
  render(
    <TranscriptEditor
      roundId="round"
      citedSegmentId="removed-passage"
      onClose={vi.fn()}
      onChange={vi.fn()}
    />
  );
  await screen.findByText(
    /This passage is no longer in the current transcript/
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit transcript' }));
  expect(screen.getByLabelText('Text for passage 1')).toHaveValue(
    '<script>literal source</script>'
  );
  expect(editTranscript).not.toHaveBeenCalled();
});
