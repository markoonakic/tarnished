/**
 * Storage helpers for settings and job status caching
 * Uses webextension-polyfill for cross-browser compatibility
 */

import browser from 'webextension-polyfill';
import { DEFAULT_COLORS, type ThemeColors } from './theme';

export const THEME_SETTINGS_STORAGE_KEY = 'themeSettings';
const AUTO_FILL_ON_LOAD_STORAGE_KEY = 'autoFillOnLoad';

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

export async function getAutoFillOnLoad(): Promise<boolean> {
  const result = (await browser.storage.local.get(
    AUTO_FILL_ON_LOAD_STORAGE_KEY
  )) as {
    autoFillOnLoad?: boolean;
  };

  return result.autoFillOnLoad ?? false;
}

export async function setAutoFillOnLoad(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [AUTO_FILL_ON_LOAD_STORAGE_KEY]: enabled });
}

export async function getThemeColorsCache(): Promise<ThemeColors> {
  const result = (await browser.storage.local.get(
    THEME_SETTINGS_STORAGE_KEY
  )) as Record<string, ThemeColors>;

  return result[THEME_SETTINGS_STORAGE_KEY] || DEFAULT_COLORS;
}

export async function setThemeColorsCache(colors: ThemeColors): Promise<void> {
  await browser.storage.local.set({ [THEME_SETTINGS_STORAGE_KEY]: colors });
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
