/**
 * Content script for Job Tracker extension
 * Runs on web pages to detect job listings, communicate with the popup/background scripts,
 * and autofill application forms.
 */

import browser from 'webextension-polyfill';
import { detectJobPage, type DetectionResult } from '../lib/detection';
import { getAutofillEngine, type AutofillProfile, type AutofillResult } from '../lib/autofill/index';

// ============================================================================
// Form Detection State
// ============================================================================

let formDetected = false;
let fillableFieldCount = 0;

/**
 * Scan for fillable fields and update state.
 */
function scanForFields(): void {
  const engine = getAutofillEngine();
  const result = engine.scan();
  formDetected = result.hasApplicationForm;
  fillableFieldCount = result.fillableFields.length;

  // Get all inputs on page for debugging
  const allInputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"]), textarea'
  );

  // Debug logging - show all inputs found on page
  console.log('[Job Tracker] Field scan result:', {
    totalInputsOnPage: allInputs.length,
    hasApplicationForm: result.hasApplicationForm,
    totalRelevantFields: result.totalRelevantFields,
    fillableFieldCount: result.fillableFieldCount,
    fillableFields: result.fillableFields.map(f => ({
      type: f.fieldType,
      score: f.score,
      element: f.element.id || f.element.name || f.element.placeholder || 'unnamed',
    })),
    allInputs: Array.from(allInputs).slice(0, 10).map(input => ({
      tag: input.tagName,
      type: input.type,
      id: input.id,
      name: input.name,
      placeholder: input.placeholder,
      autocomplete: input.getAttribute('autocomplete'),
      ariaLabel: input.getAttribute('aria-label'),
    })),
  });

  // Notify background script of form detection state
  browser.runtime.sendMessage({
    type: 'FORM_DETECTION_UPDATE',
    hasApplicationForm: formDetected,
    fillableFieldCount,
  }).catch(() => {
    // Ignore errors if background script not ready
  });
}

// ============================================================================
// MutationObserver for Lazy-Loaded Fields
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
 * Set up MutationObserver to detect dynamically added fields.
 */
function setupMutationObserver(): void {
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        // Check if any added nodes contain inputs
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (
              node.tagName === 'INPUT' ||
              node.tagName === 'TEXTAREA' ||
              node.querySelector('input, textarea')
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
 * Runs job detection and sends the result to the background script
 */
function runDetection(): void {
  const result = detectJobPage();

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

// Run detection when DOM is ready
if (document.readyState === 'complete') {
  runDetection();
  setupMutationObserver();
} else {
  window.addEventListener('load', () => {
    runDetection();
    setupMutationObserver();
  });
}

// ============================================================================
// Message Listener
// ============================================================================

/**
 * Message listener for requests from popup/background scripts
 * Handles GET_TEXT, GET_DETECTION, AUTOFILL_FORM, and SCAN_FIELDS message types
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
      const engine = getAutofillEngine();
      const result: AutofillResult = engine.fill(message.profile);
      return Promise.resolve({
        filledCount: result.filledCount,
      });
    }

    return Promise.resolve(undefined);
  }
);
