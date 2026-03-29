import { describe, expect, it, vi } from 'vitest';

import { updateActionIcon } from './icon';

function createFakeContext(size: number) {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    getImageData: vi.fn().mockReturnValue({ size }),
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineCap: 'butt',
    lineJoin: 'miter',
  };
}

describe('background icon helpers', () => {
  it('builds tinted image data for all action icon sizes', async () => {
    const contexts = new Map<number, ReturnType<typeof createFakeContext>>();
    const setIcon = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();

    await updateActionIcon({
      accentHex: '#00ffaa',
      getRuntimeUrl: vi.fn((path: string) => `chrome-extension://${path}`),
      fetchBlob: vi.fn().mockResolvedValue(new Blob(['icon'])),
      createImageBitmap: vi
        .fn()
        .mockResolvedValue({ width: 48, height: 48, close }),
      createCanvas: (size) => ({
        getContext: () => {
          const context = createFakeContext(size);
          contexts.set(size, context);
          return context as unknown as OffscreenCanvasRenderingContext2D;
        },
      }),
      setIcon,
      debug: vi.fn(),
      error: vi.fn(),
    });

    expect(setIcon).toHaveBeenCalledWith({
      16: { size: 16 },
      48: { size: 48 },
      128: { size: 128 },
    });
    expect(contexts.get(16)?.fillStyle).toBe('#00ffaa');
    expect(close).toHaveBeenCalledTimes(3);
  });

  it('falls back to the drawn tree icon when loading a source image fails', async () => {
    const contexts = new Map<number, ReturnType<typeof createFakeContext>>();
    const setIcon = vi.fn().mockResolvedValue(undefined);
    const error = vi.fn();

    await updateActionIcon({
      accentHex: '#ff9900',
      getRuntimeUrl: vi.fn((path: string) => `chrome-extension://${path}`),
      fetchBlob: vi.fn().mockRejectedValue(new Error('missing asset')),
      createImageBitmap: vi.fn(),
      createCanvas: (size) => ({
        getContext: () => {
          const context = createFakeContext(size);
          contexts.set(size, context);
          return context as unknown as OffscreenCanvasRenderingContext2D;
        },
      }),
      setIcon,
      debug: vi.fn(),
      error,
    });

    expect(contexts.get(48)?.beginPath).toHaveBeenCalled();
    expect(setIcon).toHaveBeenCalledWith({
      16: { size: 16 },
      48: { size: 48 },
      128: { size: 128 },
    });
    expect(error).toHaveBeenCalled();
  });
});
