/**
 * Content script for Job Tracker extension
 * Runs on web pages to detect job listings and communicate with the popup/background scripts
 */

import browser from 'webextension-polyfill';
import { detectJobPage, type DetectionResult } from '../lib/detection';

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
}

// Run detection when DOM is ready
if (document.readyState === 'complete') {
  runDetection();
} else {
  window.addEventListener('load', runDetection);
}

/**
 * Message listener for requests from popup/background scripts
 * Handles GET_HTML and GET_DETECTION message types
 */
browser.runtime.onMessage.addListener(
  (message: { type: string }): Promise<{ html?: string } | DetectionResult | undefined> => {
    if (message.type === 'GET_HTML') {
      return Promise.resolve({
        html: document.documentElement.outerHTML,
      });
    }

    if (message.type === 'GET_DETECTION') {
      return Promise.resolve(detectJobPage());
    }

    return Promise.resolve(undefined);
  }
);
