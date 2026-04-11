import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('extension api boundaries', () => {
  it('does not keep stale /api/v1 endpoint constants in the source tree', () => {
    const constantsPath = resolve(process.cwd(), 'src/lib/constants.ts');
    const source = readFileSync(constantsPath, 'utf8');

    expect(source).not.toMatch(/\/api\/v1\//);
  });

  it('does not expose legacy application description aliases in api-core types', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/api-core.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/\bdescription:\s*string\s*\|\s*null;/);
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
