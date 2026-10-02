import {
  scanForFillableFields,
  fillProfile,
  type AutofillProfile,
} from '../lib/autofill';
import { shouldScheduleFormRescan } from './scan-trigger';

(function iframeScanner() {
  if (window.self === window.top) return;

  const flag = '__tarnishedIframeScannerInitialized';
  const frameWindow = window as Window & { [flag]?: boolean };
  if (frameWindow[flag]) return;

  // The injecting element carries the parent page's scan token into this world.
  const token = (document.currentScript as HTMLScriptElement | null)?.dataset
    .tarnishedScanToken;
  if (!token) return;
  frameWindow[flag] = true;

  const parentOrigin = document.referrer
    ? new URL(document.referrer).origin
    : null;

  function scanAndReport(): void {
    const result = scanForFillableFields();
    window.parent.postMessage(
      {
        type: 'TARNISHED_IFRAME_SCAN_RESULT',
        payload: {
          hasApplicationForm: result.hasApplicationForm,
          fillableFieldCount: result.fillableFields.length,
          token,
        },
      },
      parentOrigin ?? '*'
    );
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (parentOrigin && event.origin !== parentOrigin) return;
    const { type, payload } = event.data || {};
    if (
      type === 'TARNISHED_IFRAME_AUTOFILL' &&
      payload?.profile &&
      payload.token === token
    ) {
      const filledCount = fillProfile(payload.profile as AutofillProfile);
      window.parent.postMessage(
        {
          type: 'TARNISHED_IFRAME_AUTOFILL_RESULT',
          payload: { filledCount },
        },
        parentOrigin ?? '*'
      );
    }
  });

  function startScanning(): void {
    scanAndReport();
    let scanTimeout: ReturnType<typeof setTimeout> | null = null;
    new MutationObserver((mutations) => {
      if (!shouldScheduleFormRescan(mutations)) return;
      if (scanTimeout) clearTimeout(scanTimeout);
      scanTimeout = setTimeout(() => {
        scanAndReport();
        scanTimeout = null;
      }, 250);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'complete') {
    startScanning();
  } else {
    window.addEventListener('load', startScanning, { once: true });
  }
})();
