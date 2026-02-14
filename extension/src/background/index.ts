/**
 * Background script for Job Tracker extension
 * Manages tab state tracking, badge updates, and message handling
 */

import browser from 'webextension-polyfill';

/**
 * Status information for a tracked tab
 */
interface TabStatus {
  isJobPage: boolean;
  score: number;
  signals: string[];
  url: string;
}

// Store detection results per tab
const tabStatus = new Map<number, TabStatus>();

/**
 * Listen for tab updates to trigger detection
 * When a tab finishes loading, request detection from content script
 */
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Request detection from content script
    try {
      const response = await browser.tabs.sendMessage(tabId, {
        type: 'GET_DETECTION',
      });

      if (response) {
        tabStatus.set(tabId, {
          isJobPage: response.isJobPage,
          score: response.score,
          signals: response.signals,
          url: tab.url,
        });
        updateBadge(tabId, response.isJobPage);
      }
    } catch {
      // Content script might not be loaded on this page (e.g., chrome://, extension pages)
      tabStatus.delete(tabId);
      updateBadge(tabId, false);
    }
  }
});

/**
 * Listen for messages from content script and popup
 * Handles DETECTION_RESULT from content script and GET_TAB_STATUS from popup
 */
browser.runtime.onMessage.addListener((message, sender) => {
  // From content script: detection result
  if (message.type === 'DETECTION_RESULT' && sender.tab?.id) {
    tabStatus.set(sender.tab.id, {
      isJobPage: message.isJobPage,
      score: message.score,
      signals: message.signals,
      url: message.url,
    });
    updateBadge(sender.tab.id, message.isJobPage);
    return Promise.resolve(undefined);
  }

  // From popup: get tab status
  if (message.type === 'GET_TAB_STATUS') {
    return Promise.resolve(tabStatus.get(message.tabId) || null);
  }

  return Promise.resolve(undefined);
});

/**
 * Update badge for a tab
 * Green badge with checkmark for job pages, clear badge for non-job pages
 *
 * @param tabId - The tab ID to update the badge for
 * @param isJobPage - Whether the page is detected as a job posting
 */
function updateBadge(tabId: number, isJobPage: boolean): void {
  if (isJobPage) {
    // Show green badge with checkmark for job pages
    browser.action.setBadgeText({ text: '\u2713', tabId }); // Checkmark character
    browser.action.setBadgeBackgroundColor({ color: '#689d6a', tabId }); // Gruvbox green
  } else {
    // Clear badge for non-job pages
    browser.action.setBadgeText({ text: '', tabId });
  }
}

/**
 * Clean up when tabs are closed
 * Remove tab status from memory to prevent leaks
 */
browser.tabs.onRemoved.addListener((tabId) => {
  tabStatus.delete(tabId);
});

// Log that background script is loaded (for debugging)
console.log('Job Tracker extension background script loaded');

export {};
