import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionRoot = resolve(process.cwd());

const loggingBoundaryFiles = [
  'src/lib/api.ts',
  'src/popup/index.ts',
  'src/options/index.ts',
  'src/content/index.ts',
  'src/content/iframe-scanner.ts',
];

const storageBoundaryFiles = [
  'src/background/index.ts',
  'src/popup/index.ts',
  'src/lib/theme-utils.ts',
];

describe('extension architecture boundaries', () => {
  it('routes feature logging through the shared logger', () => {
    for (const relativePath of loggingBoundaryFiles) {
      const source = readFileSync(resolve(extensionRoot, relativePath), 'utf8');
      expect(source).not.toMatch(/console\.(log|warn|error|info|debug)/);
    }
  });

  it('routes storage access through storage helpers', () => {
    for (const relativePath of storageBoundaryFiles) {
      const source = readFileSync(resolve(extensionRoot, relativePath), 'utf8');
      expect(source).not.toMatch(/browser\.storage\.local\.(get|set)/);
    }
  });

  it('keeps popup entry focused on wiring instead of notification and favicon details', () => {
    const source = readFileSync(resolve(extensionRoot, 'src/popup/index.ts'), 'utf8');

    expect(source).not.toMatch(/browser\.notifications\.create/);
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/querySelector\(\s*'link\[rel="icon"\]'/);
  });
});
