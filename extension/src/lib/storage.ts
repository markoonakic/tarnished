/**
 * Storage helpers for settings and job status caching
 * Uses webextension-polyfill for cross-browser compatibility
 */

import browser from 'webextension-polyfill';

// ============================================================================
// Settings Types & Functions
// ============================================================================

/**
 * User-configurable extension settings
 */
export interface Settings {
  appUrl: string;
  apiKey: string;
}

/**
 * Retrieve extension settings from storage
 * Returns empty strings for missing values
 */
export async function getSettings(): Promise<Settings> {
  const result = (await browser.storage.local.get([
    'appUrl',
    'apiKey',
  ])) as Partial<Settings>;
  return {
    appUrl: result.appUrl || '',
    apiKey: result.apiKey || '',
  };
}

/**
 * Save extension settings to storage
 */
export async function setSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set(
    settings as unknown as Record<string, unknown>
  );
}

// ============================================================================
// Job Status Types & Functions
// ============================================================================

/**
 * Cached job status for a specific URL
 */
export interface JobStatus {
  url: string;
  isJobPage: boolean;
  existingLeadId: string | null;
  title: string | null;
  company: string | null;
}

/**
 * Retrieve cached job status for a URL
 * Returns null if no cached status exists
 */
export async function getJobStatus(url: string): Promise<JobStatus | null> {
  const key = `job_${url}`;
  const result = (await browser.storage.local.get(key)) as Record<
    string,
    JobStatus
  >;
  return result[key] || null;
}

/**
 * Cache job status for a URL
 */
export async function setJobStatus(
  url: string,
  status: JobStatus
): Promise<void> {
  const key = `job_${url}`;
  await browser.storage.local.set({ [key]: status });
}
