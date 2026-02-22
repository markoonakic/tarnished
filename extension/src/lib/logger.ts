/**
 * Logging utility for the Tarnished extension.
 *
 * Provides debug logging that can be enabled/disabled.
 * In production, only errors and warnings are logged.
 * Set DEBUG=true in localStorage to enable verbose logging.
 */

import browser from 'webextension-polyfill';

/** Whether debug logging is enabled */
let debugEnabled = false;

/**
 * Check if debug mode is enabled.
 * Can be toggled via browser.storage.local.set({ tarnished_debug: true })
 */
async function checkDebugMode(): Promise<boolean> {
  try {
    // Use browser.storage to persist debug setting
    const result = await browser.storage.local.get('tarnished_debug');
    return result.tarnished_debug === true;
  } catch {
    return false;
  }
}

// Initialize debug mode check
checkDebugMode().then((enabled) => {
  debugEnabled = enabled;
});

/**
 * Log a debug message (only shown when debug mode is enabled).
 * Use for development/troubleshooting, not for production errors.
 *
 * @param context - The module/context name (e.g., 'Theme', 'Icon', 'Background')
 * @param message - The message or data to log
 */
export function debug(context: string, ...args: unknown[]): void {
  if (debugEnabled) {
    console.log(`[${context}]`, ...args);
  }
}

/**
 * Log a warning message (always shown).
 * Use for recoverable issues that should be investigated.
 *
 * @param context - The module/context name
 * @param message - The message or data to log
 */
export function warn(context: string, ...args: unknown[]): void {
  console.warn(`[${context}]`, ...args);
}

/**
 * Log an error message (always shown).
 * Use for errors that affect functionality.
 *
 * @param context - The module/context name
 * @param message - The message or data to log
 */
export function error(context: string, ...args: unknown[]): void {
  console.error(`[${context}]`, ...args);
}

/**
 * Enable or disable debug mode.
 * Setting persists across browser restarts.
 *
 * @param enabled - Whether to enable debug mode
 */
export async function setDebugMode(enabled: boolean): Promise<void> {
  debugEnabled = enabled;
  try {
    await browser.storage.local.set({ tarnished_debug: enabled });
  } catch {
    // Storage might not be available in all contexts
  }
}

/**
 * Check if debug mode is currently enabled.
 */
export function isDebugEnabled(): boolean {
  return debugEnabled;
}
