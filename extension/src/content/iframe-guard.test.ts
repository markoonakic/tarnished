import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('iframe scanner guard helpers', () => {
  it('uses a typed reinjection guard instead of any-casting window state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/content/iframe-scanner.ts'),
      'utf8'
    );

    expect(source).toMatch(/type IframeScannerWindow = Window/);
    expect(source).not.toMatch(/window as any/);
  });
});
