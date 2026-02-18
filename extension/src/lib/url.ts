/**
 * URL utility functions for the Tarnished extension.
 *
 * Handles URL normalization and construction to avoid issues with
 * trailing slashes and path concatenation.
 */

/**
 * Normalizes a base URL by removing trailing slashes.
 * This ensures consistent URL construction regardless of how users
 * enter their app URL.
 *
 * @param url - The URL to normalize
 * @returns The URL without trailing slashes
 *
 * @example
 * normalizeBaseUrl('http://localhost:5173/')  // 'http://localhost:5173'
 * normalizeBaseUrl('http://localhost:5173')   // 'http://localhost:5173'
 */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Builds a full URL from a base URL and path.
 * Handles trailing slashes on base and leading slashes on path.
 *
 * @param baseUrl - The base URL (e.g., 'http://localhost:5173')
 * @param path - The API path (e.g., '/api/users/settings')
 * @returns The full URL
 *
 * @example
 * buildUrl('http://localhost:5173/', '/api/users')  // 'http://localhost:5173/api/users'
 * buildUrl('http://localhost:5173', 'api/users')    // 'http://localhost:5173/api/users'
 */
export function buildUrl(baseUrl: string, path: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}
