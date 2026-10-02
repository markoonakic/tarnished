import browser from 'webextension-polyfill';
import { createIframeRegistry, type IframeScanResult } from './iframe-registry';
import { shouldScheduleFormRescan } from './scan-trigger';
import { detectJobPage, type DetectionResult } from '../lib/detection';
import { debug, warn } from '../lib/logger';
import {
  scanForFillableFields,
  fillProfile,
  type AutofillProfile,
} from '../lib/autofill/index';

const MESSAGE_PREFIX = 'TARNISHED_';
const IFRAME_SCAN_RESULT = `${MESSAGE_PREFIX}IFRAME_SCAN_RESULT`;
const IFRAME_AUTOFILL = `${MESSAGE_PREFIX}IFRAME_AUTOFILL`;
const IFRAME_AUTOFILL_RESULT = `${MESSAGE_PREFIX}IFRAME_AUTOFILL_RESULT`;

let formDetected = false;
let fillableFieldCount = 0;
let scanRetryCount = 0;
const MAX_SCAN_RETRIES = 5;
const SCAN_RETRY_DELAY = 1000; // 1 second

// Correlates injected scanner results; visible to the hosting page.
function generateScanToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

const scanToken = generateScanToken();

const iframeRegistry = createIframeRegistry({
  isTrustedFrame: isEmbeddedFrame,
  resolveFrameWindow: resolveFrameWindow,
  scanToken: scanToken,
});

/** Checks frame membership before sharing profile data. */
function isEmbeddedFrame(source: MessageEventSource | null): boolean {
  if (!source) {
    return false;
  }
  for (const iframe of document.querySelectorAll('iframe')) {
    if (iframe.contentWindow === source) {
      return true;
    }
  }
  return false;
}

/** Excludes removed or replaced frames, including at dispatch time. */
function resolveFrameWindow(
  source: MessageEventSource | null
): { postMessage: (message: unknown, targetOrigin: string) => void } | null {
  if (!source) {
    return null;
  }
  for (const iframe of document.querySelectorAll('iframe')) {
    if (iframe.contentWindow === source) {
      return iframe.contentWindow as unknown as {
        postMessage: (message: unknown, targetOrigin: string) => void;
      };
    }
  }
  return null;
}

/** Injects scanners into accessible same-origin frames only. */
async function injectIntoIframes(): Promise<void> {
  const iframes = document.querySelectorAll('iframe');

  for (const iframe of iframes) {
    try {
      // Try to inject directly for same-origin iframes
      if (iframe.contentDocument) {
        // The scanner reads this DOM attribute via document.currentScript in
        // its page world; an isolated-world window property would not transfer.
        const script = iframe.contentDocument.createElement('script');
        script.src = browser.runtime.getURL('content/iframe-scanner.js');
        script.dataset.tarnishedScanToken = scanToken;
        script.onload = () => {
          debug('Content', 'Injected scanner into same-origin iframe');
        };
        script.onerror = () => {
          warn(
            'Content',
            'Failed to inject into iframe, requesting background injection'
          );
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
async function requestBackgroundInjection(
  iframe: HTMLIFrameElement
): Promise<void> {
  try {
    await browser.runtime.sendMessage({
      type: 'INJECT_INTO_IFRAME',
      frameSrc: iframe.src,
    });
  } catch (error) {
    warn('Content', 'Failed to request iframe injection:', error);
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
      iframeRegistry.recordScanResult(
        {
          origin: event.origin,
          source: event.source,
        },
        payload as IframeScanResult
      );

      debug('Content', 'Received iframe scan result:', {
        origin: event.origin,
        hasApplicationForm: payload.hasApplicationForm,
        fillableFieldCount: payload.fillableFieldCount,
      });

      // Update aggregated state
      aggregateAndReport();
    }

    if (type === IFRAME_AUTOFILL_RESULT && payload) {
      debug('Content', 'Iframe autofill result:', payload);
    }
  });
}

/**
 * Aggregate results from main frame and all iframes, then report to background.
 */
function aggregateAndReport(): void {
  // Start with main frame scan
  const mainResult = scanForFillableFields();

  let totalFillable = mainResult.fillableFields.length;
  let hasApplicationForm = mainResult.hasApplicationForm;

  // Add iframe results
  for (const result of iframeRegistry.getResults()) {
    totalFillable += result.fillableFieldCount;
    if (result.hasApplicationForm) {
      hasApplicationForm = true;
    }
  }

  // Update state
  formDetected = hasApplicationForm;
  fillableFieldCount = totalFillable;

  // Send to background
  browser.runtime
    .sendMessage({
      type: 'FORM_DETECTION_UPDATE',
      hasApplicationForm: formDetected,
      fillableFieldCount,
    })
    .catch(() => {
      // Ignore errors if background script not ready
    });
}

/** Returns delivery attempts, not successfully filled fields. */
function sendAutofillToIframes(profile: AutofillProfile): number {
  return iframeRegistry.sendAutofill(IFRAME_AUTOFILL, profile);
}

/**
 * Scan for fillable fields in the main frame and update state.
 */
function scanForFields(): void {
  const result = scanForFillableFields();

  // Get all inputs on page for debugging
  const allInputs = document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"]), textarea'
  );

  // Check for iframes
  const iframes = document.querySelectorAll('iframe');

  debug('Content', 'Main frame field scan result:', {
    totalInputsOnPage: allInputs.length,
    hasApplicationForm: result.hasApplicationForm,
    totalRelevantFields: result.totalRelevantFields,
    fillableFieldCount: result.fillableFields.length,
    iframeCount: iframes.length,
    fillableFields: result.fillableFields.map((f) => ({
      type: f.fieldType,
      score: f.score,
      element:
        f.element.id || f.element.name || f.element.placeholder || 'unnamed',
    })),
  });

  // If no inputs found and we haven't exhausted retries, try again later
  if (allInputs.length === 0 && scanRetryCount < MAX_SCAN_RETRIES) {
    scanRetryCount++;
    debug(
      'Content',
      `No inputs found, retrying in ${SCAN_RETRY_DELAY}ms (attempt ${scanRetryCount}/${MAX_SCAN_RETRIES})`
    );
    setTimeout(scanForFields, SCAN_RETRY_DELAY);
    return;
  }

  // Aggregate with iframe results and report
  aggregateAndReport();

  // Inject scanner into iframes
  injectIntoIframes();
}

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
    if (shouldScheduleFormRescan([...mutations])) {
      debouncedScan();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Runs job detection and sends the result to the background script.
 */
function runDetection(): void {
  const result = detectJobPage();

  debug('Content', 'Job detection result:', {
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
      warn('Content', 'Failed to send detection result:', error);
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

/**
 * Message listener for requests from popup/background scripts.
 */
browser.runtime.onMessage.addListener(
  (
    message: unknown
  ): Promise<
    | {
        text?: string;
        filledCount?: number;
        framesContacted?: number;
        fillableFieldCount?: number;
        hasApplicationForm?: boolean;
      }
    | DetectionResult
    | undefined
  > => {
    const msg = message as { type: string; profile?: AutofillProfile };

    if (msg.type === 'GET_TEXT') {
      return Promise.resolve({
        text: document.body.innerText,
      });
    }

    if (msg.type === 'GET_DETECTION') {
      return Promise.resolve(detectJobPage());
    }

    if (msg.type === 'SCAN_FIELDS') {
      scanForFields();
      return Promise.resolve({
        fillableFieldCount,
        hasApplicationForm: formDetected,
      });
    }

    if (msg.type === 'AUTOFILL_FORM' && msg.profile) {
      // Fill fields in main frame
      const filledCount = fillProfile(msg.profile);

      // Also send to embedded iframes. Frame results are asynchronous, so report
      // the frame post-attempt count alongside the main-frame fill count; the popup
      // states plainly when frame results could not be confirmed.
      const framesContacted = sendAutofillToIframes(msg.profile);

      return Promise.resolve({
        filledCount,
        framesContacted,
      });
    }

    return Promise.resolve(undefined);
  }
);
