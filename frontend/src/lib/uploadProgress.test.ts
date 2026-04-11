import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock('./api', () => ({
  default: {
    post,
  },
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
