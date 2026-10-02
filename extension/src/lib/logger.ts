import browser from 'webextension-polyfill';

// Enable debug logs with browser.storage.local.set({ tarnished_debug: true }).
let debugEnabled = false;
browser.storage.local
  .get('tarnished_debug')
  .then((result) => {
    debugEnabled = result.tarnished_debug === true;
  })
  .catch(() => {});

export function debug(context: string, ...args: unknown[]): void {
  if (debugEnabled) console.log(`[${context}]`, ...args);
}

export function warn(context: string, ...args: unknown[]): void {
  console.warn(`[${context}]`, ...args);
}

export function error(context: string, ...args: unknown[]): void {
  console.error(`[${context}]`, ...args);
}
