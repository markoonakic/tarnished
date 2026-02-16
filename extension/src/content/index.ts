/**
 * Content script for Job Tracker extension
 * Runs on web pages to detect job listings, communicate with the popup/background scripts,
 * and autofill application forms.
 *
 * Architecture:
 * - Runs in top frame only (all_frames: false in manifest)
 * - Detects job pages and scans forms in main frame
 * - Injects iframe-scanner.js into iframes for cross-origin form detection
 * - Aggregates results from iframes via postMessage
 */

import browser from 'webextension-polyfill';
import { detectJobPage, type DetectionResult } from '../lib/detection';
import { getAutofillEngine, type AutofillProfile, type AutofillResult } from '../lib/autofill/index';

// ============================================================================
// Message Type Constants
// ============================================================================

const MESSAGE_PREFIX = 'JOB_TRACKER_';
const IFRAME_SCAN_RESULT = `${MESSAGE_PREFIX}IFRAME_SCAN_RESULT`;
const IFRAME_AUTOFILL = `${MESSAGE_PREFIX}IFRAME_AUTOFILL`;
const IFRAME_AUTOFILL_RESULT = `${MESSAGE_PREFIX}IFRAME_AUTOFILL_RESULT`;

// ============================================================================
// Form Detection State
// ============================================================================

let formDetected = false;
let fillableFieldCount = 0;
let scanRetryCount = 0;
const MAX_SCAN_RETRIES = 5;
const SCAN_RETRY_DELAY = 1000; // 1 second

// Track iframe scan results
interface IframeScanResult {
  hasApplicationForm: boolean;
  fillableFieldCount: number;
  fields: Array<{
    fieldType: string;
    score: number;
    id: string;
    name: string;
    placeholder: string;
  }>;
}

const iframeResults = new Map<string, IframeScanResult>();

// ============================================================================
// Iframe Handling
// ============================================================================

/**
 * Inject the iframe scanner into all iframes on the page.
 * Uses messaging to request background script injection for cross-origin iframes.
 */
async function injectIntoIframes(): Promise<void> {
  const iframes = document.querySelectorAll('iframe');

  for (const iframe of iframes) {
    try {
      // Try to inject directly for same-origin iframes
      if (iframe.contentDocument) {
        // Same-origin: create and inject script element
        const script = iframe.contentDocument.createElement('script');
        script.src = browser.runtime.getURL('content/iframe-scanner.js');
        script.onload = () => {
          console.log('[Job Tracker] Injected scanner into same-origin iframe');
        };
        script.onerror = () => {
          console.warn('[Job Tracker] Failed to inject into iframe, requesting background injection');
          requestBackgroundInjection(iframe);
        };
        iframe.contentDocument.documentElement.appendChild(script);
      } else {
        // Cross-origin: request background script to inject
        requestBackgroundInjection(iframe);
      }
    } catch {
      // Cross-origin access denied, request background injection
      requestBackgroundInjection(iframe);
    }
  }
}

/**
 * Request the background script to inject the scanner into a cross-origin iframe.
 */
async function requestBackgroundInjection(iframe: HTMLIFrameElement): Promise<void> {
  try {
    await browser.runtime.sendMessage({
      type: 'INJECT_INTO_IFRAME',
      frameSrc: iframe.src,
    });
  } catch (error) {
    console.warn('[Job Tracker] Failed to request iframe injection:', error);
  }
}

/**
 * Listen for postMessage from iframe scanners.
 */
function setupIframeMessageListener(): void {
  window.addEventListener('message', (event) => {
    // Only accept messages from iframes on this page
    if (event.source === window) {
      return;
    }

    const { type, payload } = event.data || {};

    if (type === IFRAME_SCAN_RESULT && payload) {
      // Store result keyed by iframe origin + path
      const key = event.origin + (payload.path || '');
      iframeResults.set(key, payload);

      console.log('[Job Tracker] Received iframe scan result:', {
        origin: event.origin,
        hasApplicationForm: payload.hasApplicationForm,
        fillableFieldCount: payload.fillableFieldCount,
      });

      // Update aggregated state
      aggregateAndReport();
    }

    if (type === IFRAME_AUTOFILL_RESULT && payload) {
      console.log('[Job Tracker] Iframe autofill result:', payload);
    }
  });
}

/**
 * Aggregate results from main frame and all iframes, then report to background.
 */
function aggregateAndReport(): void {
  // Start with main frame scan
  const engine = getAutofillEngine();
  const mainResult = engine.scan();

  let totalFillable = mainResult.fillableFields.length;
  let hasApplicationForm = mainResult.hasApplicationForm;

  // Add iframe results
  for (const [, result] of iframeResults) {
    totalFillable += result.fillableFieldCount;
    if (result.hasApplicationForm) {
      hasApplicationForm = true;
    }
  }

  // Update state
  formDetected = hasApplicationForm;
  fillableFieldCount = totalFillable;

  // Send to background
  browser.runtime.sendMessage({
    type: 'FORM_DETECTION_UPDATE',
    hasApplicationForm: formDetected,
    fillableFieldCount,
  }).catch(() => {
    // Ignore errors if background script not ready
  });
}

/**
 * Send autofill command to all iframes.
 */
function sendAutofillToIframes(profile: AutofillProfile): void {
  const iframes = document.querySelectorAll('iframe');

  for (const iframe of iframes) {
    try {
      iframe.contentWindow?.postMessage(
        {
          type: IFRAME_AUTOFILL,
          payload: { profile },
        },
        '*'
      );
    } catch {
      // Ignore cross-origin errors
    }
  }
}

// ============================================================================
// Form Detection
// ============================================================================

/**
 * Scan for fillable fields in the main frame and update state.
 */
function scanForFields(): void {
  const engine = getAutofillEngine();
  const result = engine.scan();

  // Get all inputs on page for debugging
  const allInputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"]), textarea'
  );

  // Check for iframes
  const iframes = document.querySelectorAll('iframe');

  console.log('[Job Tracker] Main frame field scan result:', {
    totalInputsOnPage: allInputs.length,
    hasApplicationForm: result.hasApplicationForm,
    totalRelevantFields: result.totalRelevantFields,
    fillableFieldCount: result.fillableFields.length,
    iframeCount: iframes.length,
    fillableFields: result.fillableFields.map(f => ({
      type: f.fieldType,
      score: f.score,
      element: f.element.id || f.element.name || f.element.placeholder || 'unnamed',
    })),
  });

  // If no inputs found and we haven't exhausted retries, try again later
  if (allInputs.length === 0 && scanRetryCount < MAX_SCAN_RETRIES) {
    scanRetryCount++;
    console.log(`[Job Tracker] No inputs found, retrying in ${SCAN_RETRY_DELAY}ms (attempt ${scanRetryCount}/${MAX_SCAN_RETRIES})`);
    setTimeout(scanForFields, SCAN_RETRY_DELAY);
    return;
  }

  // Aggregate with iframe results and report
  aggregateAndReport();

  // Inject scanner into iframes
  injectIntoIframes();
}

// ============================================================================
// MutationObserver for Lazy-Loaded Fields and Iframes
// ============================================================================

let scanTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced scan for fields (prevents excessive scanning on rapid DOM changes).
 */
function debouncedScan(): void {
  if (scanTimeout) {
    clearTimeout(scanTimeout);
  }
  scanTimeout = setTimeout(() => {
    scanForFields();
    scanTimeout = null;
  }, 250);
}

/**
 * Set up MutationObserver to detect dynamically added fields and iframes.
 */
function setupMutationObserver(): void {
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (
              node.tagName === 'INPUT' ||
              node.tagName === 'TEXTAREA' ||
              node.tagName === 'IFRAME' ||
              node.querySelector('input, textarea, iframe')
            ) {
              shouldScan = true;
              break;
            }
          }
        }
      }

      if (shouldScan) break;
    }

    if (shouldScan) {
      debouncedScan();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ============================================================================
// Job Detection
// ============================================================================

/**
 * Runs job detection and sends the result to the background script.
 */
function runDetection(): void {
  const result = detectJobPage();

  console.log('[Job Tracker] Job detection result:', {
    isJobPage: result.isJobPage,
    score: result.score,
    signals: result.signals,
  });

  // Send result to background script
  browser.runtime
    .sendMessage({
      type: 'DETECTION_RESULT',
      isJobPage: result.isJobPage,
      score: result.score,
      signals: result.signals,
      url: window.location.href,
    })
    .catch((error) => {
      console.warn('Job Tracker: Failed to send detection result:', error);
    });

  // Also scan for fillable fields
  scanForFields();
}

// Initialize when DOM is ready
if (document.readyState === 'complete') {
  runDetection();
  setupMutationObserver();
  setupIframeMessageListener();
} else {
  window.addEventListener('load', () => {
    runDetection();
    setupMutationObserver();
    setupIframeMessageListener();
  });
}

// ============================================================================
// Message Listener
// ============================================================================

/**
 * Message listener for requests from popup/background scripts.
 */
browser.runtime.onMessage.addListener(
  (message: {
    type: string;
    profile?: AutofillProfile;
  }): Promise<
    | { text?: string; filledCount?: number; fillableFieldCount?: number; hasApplicationForm?: boolean }
    | DetectionResult
    | undefined
  > => {
    if (message.type === 'GET_TEXT') {
      return Promise.resolve({
        text: document.body.innerText,
      });
    }

    if (message.type === 'GET_DETECTION') {
      return Promise.resolve(detectJobPage());
    }

    if (message.type === 'SCAN_FIELDS') {
      scanForFields();
      return Promise.resolve({
        fillableFieldCount,
        hasApplicationForm: formDetected,
      });
    }

    if (message.type === 'AUTOFILL_FORM' && message.profile) {
      // Fill fields in main frame
      const engine = getAutofillEngine();
      const result: AutofillResult = engine.fill(message.profile);

      // Also send to iframes
      sendAutofillToIframes(message.profile);

      return Promise.resolve({
        filledCount: result.filledCount,
      });
    }

    return Promise.resolve(undefined);
  }
);
