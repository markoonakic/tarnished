import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('extension api boundaries', () => {
  it('keeps the api barrel free of direct fetch logic', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/api.ts'), 'utf8');

    expect(source).not.toMatch(/fetch\(/);
    expect(source).not.toMatch(/createTimeoutController/);
  });
});
