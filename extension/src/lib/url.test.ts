import { describe, expect, it } from 'vitest';
import { buildUrl, normalizeBaseUrl } from './url';
import { InvalidUrlError } from './errors';

describe('app URLs', () => {
  it('normalizes trailing slashes and preserves an installation path', () => {
    expect(normalizeBaseUrl('https://app.invalid/tarnished///')).toBe(
      'https://app.invalid/tarnished'
    );
    expect(buildUrl('https://app.invalid/tarnished/', '/api/profile')).toBe(
      'https://app.invalid/tarnished/api/profile'
    );
    expect(buildUrl('http://localhost:5577', 'api/profile')).toBe(
      'http://localhost:5577/api/profile'
    );
  });

  it.each([
    'not a url',
    'javascript:alert(1)',
    'file:///tmp/app',
    'https://user:secret@app.invalid',
    'https://app.invalid?key=secret',
    'https://app.invalid#fragment',
  ])('rejects unsafe or ambiguous app URL %s', (url) => {
    expect(() => buildUrl(url, '/api/profile')).toThrow(InvalidUrlError);
  });
});
