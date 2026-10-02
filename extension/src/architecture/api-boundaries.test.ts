import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('extension api boundaries', () => {
  it('routes feature API requests through the shared transport', () => {
    for (const file of [
      'api-job-leads.ts',
      'api-applications.ts',
      'api-user.ts',
    ]) {
      const source = readFileSync(
        resolve(process.cwd(), 'src/lib', file),
        'utf8'
      );
      expect(source).not.toMatch(/\bfetch\(/);
      expect(source).toMatch(/fetchJson/);
    }
  });

  it('keeps the api barrel free of direct fetch logic', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/api.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/fetch\(/);
    expect(source).not.toMatch(/createTimeoutController/);
  });

  it('avoids dynamically importing the shared api barrel from popup wiring', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/popup/index.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/import\('\.\.\/lib\/api'\)/);
  });
});
