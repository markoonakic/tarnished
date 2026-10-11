import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post, withAxiosTimeZoneHeaders } = vi.hoisted(() => ({
  post: vi.fn(),
  withAxiosTimeZoneHeaders: vi.fn((headers) => headers ?? {}),
}));

vi.mock('./api', () => ({
  default: {
    post,
  },
  withAxiosTimeZoneHeaders,
}));

describe('upload api helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('forwards upload progress for application documents', async () => {
    const callback = vi.fn();
    post.mockImplementation((_url, _body, config) => {
      config?.onUploadProgress?.({ loaded: 5, total: 10 });
      return Promise.resolve({ data: { id: 'app-1' } });
    });

    const { uploadCV, uploadCoverLetter } = await import('./applications');

    await uploadCV('app-1', new File(['cv'], 'cv.pdf'), callback);
    await uploadCoverLetter(
      'app-1',
      new File(['cover'], 'cover.pdf'),
      callback
    );

    expect(callback).toHaveBeenNthCalledWith(1, 5, 10);
    expect(callback).toHaveBeenNthCalledWith(2, 5, 10);
  });

  it('keeps one recording request key per queued File and separates distinct files', async () => {
    post.mockResolvedValue({ data: { id: 'round-1' } });
    const { uploadMedia } = await import('./rounds');
    const file = new File(['audio'], 'same.wav');
    await uploadMedia('round-1', file, undefined, 0);
    await uploadMedia('round-1', file, undefined, 1);
    await uploadMedia('round-1', new File(['audio'], 'same.wav'), undefined, 1);
    const key = post.mock.calls[0][2].headers['Idempotency-Key'];
    expect(key).toBeTruthy();
    expect(post.mock.calls[1][2].headers['Idempotency-Key']).toBe(key);
    expect(post.mock.calls[2][2].headers['Idempotency-Key']).not.toBe(key);
  });
  it('sends the displayed application evidence revision on both document uploads', async () => {
    post.mockResolvedValue({ data: { id: 'app-1' } });
    const { uploadCV, uploadCoverLetter } = await import('./applications');
    await uploadCV('app-1', new File(['cv'], 'cv.txt'), undefined, 4);
    await uploadCoverLetter(
      'app-1',
      new File(['cover'], 'cover.txt'),
      undefined,
      5
    );
    expect(post.mock.calls[0][2].headers['Expected-Evidence-Revision']).toBe(4);
    expect(post.mock.calls[1][2].headers['Expected-Evidence-Revision']).toBe(5);
  });
  it('forwards upload progress for round uploads', async () => {
    const callback = vi.fn();
    post.mockImplementation((_url, _body, config) => {
      config?.onUploadProgress?.({ loaded: 7, total: 14 });
      return Promise.resolve({ data: { id: 'round-1' } });
    });

    const { uploadMedia, uploadRoundTranscript } = await import('./rounds');

    await uploadMedia('round-1', new File(['media'], 'media.mp3'), callback);
    await uploadRoundTranscript(
      'round-1',
      new File(['transcript'], 'transcript.pdf'),
      callback
    );

    expect(callback).toHaveBeenNthCalledWith(1, 7, 14);
    expect(callback).toHaveBeenNthCalledWith(2, 7, 14);
  });
});
