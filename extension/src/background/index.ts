/**
 * Background script for Job Tracker extension
 * Manages tab state tracking, badge updates, and message handling
 */

import browser from 'webextension-polyfill';
import { getProfile } from '../lib/api';
import { hasAutofillData, type AutofillProfile } from '../lib/autofill';
import { ThemeColors, UserSettings, DEFAULT_COLORS } from '../lib/theme';

const SETTINGS_STORAGE_KEY = 'themeSettings';

async function fetchThemeSettings(): Promise<ThemeColors> {
  const { apiUrl, apiKey } = await browser.storage.local.get(['apiUrl', 'apiKey']);

  if (!apiUrl || !apiKey) {
    console.log('Extension not configured, using default colors');
    return DEFAULT_COLORS;
  }

  try {
    const response = await fetch(`${apiUrl}/users/settings`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch settings: ${response.status}`);
    }

    const settings: UserSettings = await response.json();

    // Cache settings for popup
    await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings.colors });

    return settings.colors;
  } catch (error) {
    console.error('Failed to fetch theme settings:', error);

    // Try to use cached settings
    const cached = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
    if (cached[SETTINGS_STORAGE_KEY]) {
      return cached[SETTINGS_STORAGE_KEY];
    }

    return DEFAULT_COLORS;
  }
}

/**
 * Status information for a tracked tab
 */
interface TabStatus {
  isJobPage: boolean;
  score: number;
  signals: string[];
  url: string;
}

/**
 * Form detection state for a tab (used for auto-fill)
 */
interface FormDetectionState {
  hasApplicationForm: boolean;
  fillableFieldCount: number;
}

// Store detection results per tab
const tabStatus = new Map<number, TabStatus>();

// Store form detection state per tab (for auto-fill feature)
const tabFormDetectionState = new Map<number, FormDetectionState>();

// Auto-fill on page load setting
let autoFillOnLoad = false;

// Track pending iframe injection requests
const pendingIframeInjections = new Map<number, string[]>();

// ============================================================================
// Auto-Fill Setting Management
// ============================================================================

/**
 * Load the auto-fill on load setting from storage
 */
async function loadAutoFillSetting(): Promise<void> {
  try {
    const result = await browser.storage.local.get('autoFillOnLoad');
    autoFillOnLoad = result.autoFillOnLoad ?? false;
  } catch (error) {
    console.warn('Failed to load autoFillOnLoad setting:', error);
  }
}

/**
 * Trigger autofill in the content script for a specific tab
 * @param tabId - The tab ID to trigger autofill in
 */
async function triggerAutoFill(tabId: number): Promise<void> {
  try {
    // Get user profile from backend
    const profile = await getProfile();

    // Convert to AutofillProfile format
    const autofillProfile: AutofillProfile = {
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      phone: profile.phone,
      city: profile.city,
      country: profile.country,
      linkedin_url: profile.linkedin_url,
    };

    // Check if profile has any autofill data
    if (!hasAutofillData(autofillProfile)) {
      console.log('Auto-fill skipped: profile has no data');
      return;
    }

    // Send autofill message to content script
    await browser.tabs.sendMessage(tabId, {
      type: 'AUTOFILL_FORM',
      profile: autofillProfile,
    });

    console.log(`Auto-fill triggered for tab ${tabId}`);
  } catch (error) {
    // Silently fail - user may not have configured profile or API settings
    console.warn('Auto-fill failed:', error);
  }
}

// Load setting on startup
loadAutoFillSetting();

// Listen for storage changes
browser.storage.onChanged.addListener((changes) => {
  if (changes.autoFillOnLoad !== undefined) {
    autoFillOnLoad = changes.autoFillOnLoad.newValue;
  }
});

// ============================================================================
// Tab Update Listener
// ============================================================================

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
 * Handles DETECTION_RESULT from content script, GET_TAB_STATUS from popup,
 * and FORM_DETECTION_UPDATE for auto-fill feature
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

  // From content script: form detection update (for auto-fill on load)
  if (message.type === 'FORM_DETECTION_UPDATE' && sender.tab?.id) {
    const tabId = sender.tab.id;

    console.log('[Job Tracker] Form detection update:', {
      tabId,
      hasApplicationForm: message.hasApplicationForm,
      fillableFieldCount: message.fillableFieldCount,
      autoFillOnLoad,
    });

    // Store form detection state for this tab
    tabFormDetectionState.set(tabId, {
      hasApplicationForm: message.hasApplicationForm,
      fillableFieldCount: message.fillableFieldCount,
    });

    // If auto-fill on load is enabled and form detected with enough fields, trigger autofill
    if (
      autoFillOnLoad &&
      message.hasApplicationForm &&
      message.fillableFieldCount >= 2
    ) {
      console.log('[Job Tracker] Triggering auto-fill for tab', tabId);
      // Small delay to ensure the form is fully rendered
      setTimeout(() => {
        triggerAutoFill(tabId);
      }, 100);
    }

    return Promise.resolve(undefined);
  }

  // From popup: get tab status
  if (message.type === 'GET_TAB_STATUS') {
    return Promise.resolve(tabStatus.get(message.tabId) || null);
  }

  // From content script: request injection into iframe
  if (message.type === 'INJECT_INTO_IFRAME' && sender.tab?.id) {
    // We need to use scripting API to inject into iframes
    // Note: This requires the iframe to be same-origin with a host_permissions match
    // For truly cross-origin iframes, the content script already handles it via postMessage
    console.log('[Job Tracker] Received iframe injection request:', message.frameSrc);

    // Store the frame src for potential retry
    const tabId = sender.tab.id;
    if (!pendingIframeInjections.has(tabId)) {
      pendingIframeInjections.set(tabId, []);
    }
    pendingIframeInjections.get(tabId)?.push(message.frameSrc);

    return Promise.resolve({ success: true });
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
  tabFormDetectionState.delete(tabId);
  pendingIframeInjections.delete(tabId);
});

export {};
