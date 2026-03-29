/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const frontendRoot = resolve(process.cwd());

describe('frontend auth boundaries', () => {
  it('keeps token reads out of import and insights modules', () => {
    const files = ['src/lib/import.ts', 'src/lib/insights.ts'];

    for (const relativePath of files) {
      const source = readFileSync(resolve(frontendRoot, relativePath), 'utf8');
      expect(source).not.toMatch(/localStorage\.(getItem|setItem|removeItem)/);
    }
  });
});
