import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MediaPlayer from './MediaPlayer';
import { getMediaSignedUrl } from '../lib/rounds';
import type { RoundMedia } from '../lib/types';

vi.mock('../lib/rounds', () => ({ getMediaSignedUrl: vi.fn() }));
afterEach(cleanup);
it('keeps the current media URL when an earlier request finishes later', async () => {
  let finish!: (value: { url: string; expires_in: number }) => void;
  vi.mocked(getMediaSignedUrl)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    )
    .mockResolvedValueOnce({ url: '/new.mp3', expires_in: 60 });
  const media: RoundMedia = {
    id: 'old',
    media_type: 'audio',
    file_path: 'old.mp3',
    uploaded_at: '2026-10-02T12:00:00Z',
  };
  const view = render(<MediaPlayer media={media} onClose={vi.fn()} />);
  view.rerender(
    <MediaPlayer
      media={{ ...media, id: 'new', file_path: 'new.mp3' }}
      onClose={vi.fn()}
    />
  );
  await act(async () => {});
  expect(view.container.querySelector('audio')).toHaveAttribute(
    'src',
    '/new.mp3'
  );
  await act(async () => finish({ url: '/old.mp3', expires_in: 60 }));
  expect(view.container.querySelector('audio')).toHaveAttribute(
    'src',
    '/new.mp3'
  );
  expect(
    screen.queryByText('Failed to load media file')
  ).not.toBeInTheDocument();
});
