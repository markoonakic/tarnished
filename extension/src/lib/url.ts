import { InvalidUrlError } from './errors';

export function normalizeBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new InvalidUrlError();
    }
    return parsed.href.replace(/\/+$/, '');
  } catch {
    throw new InvalidUrlError();
  }
}

export function buildUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizeBaseUrl(baseUrl)}${normalizedPath}`;
}
