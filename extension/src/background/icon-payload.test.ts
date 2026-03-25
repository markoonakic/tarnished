import { describe, expect, it } from 'vitest';

import { buildActionIconPayload } from './icon-payload';

describe('background icon payload helpers', () => {
  it('wraps generated image data in the browser action payload shape', () => {
    const image16 = { id: '16' } as unknown as ImageData;
    const image48 = { id: '48' } as unknown as ImageData;

    expect(buildActionIconPayload({ 16: image16, 48: image48 })).toEqual({
      imageData: {
        '16': image16,
        '48': image48,
      },
    });
  });
});
