import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('keeps every frontend permission preset equal to its backend authority', () => {
  const backend = readFileSync(
    resolve(process.cwd(), '../backend/app/core/api_key_scopes.py'),
    'utf8'
  );
  const frontend = readFileSync(
    resolve(process.cwd(), 'src/components/settings/SettingsAPIKey.tsx'),
    'utf8'
  );
  const scopes = (body: string) =>
    [...body.matchAll(/['"]([a-z_]+:[a-z_]+)['"]/g)]
      .map((match) => match[1])
      .sort();
  const backendList = (name: string) =>
    scopes(backend.match(new RegExp(name + ' = \\[([\\s\\S]*?)\\]'))![1]);
  const frontendList = (name: string) =>
    scopes(frontend.match(new RegExp(name + ': \\[([\\s\\S]*?)\\]'))![1]);
  const full = scopes(
    frontend.match(/const FULL_ACCESS_SCOPES = \[([\s\S]*?)\]/)![1]
  );
  expect(full).toEqual(backendList('BASE_SCOPES'));
  expect(frontend).toContain('cli: FULL_ACCESS_SCOPES');
  for (const [ui, api] of [
    ['extension', 'EXTENSION_SCOPES'],
    ['read_only', 'READ_ONLY_SCOPES'],
    ['import_export', 'IMPORT_EXPORT_SCOPES'],
  ])
    expect(frontendList(ui)).toEqual(backendList(api));
  for (const scope of backendList('PRIVILEGED_SCOPES'))
    expect(frontend).toContain("'" + scope + "'");
});
