/**
 * Background script for Job Tracker extension
 * Manages tab state tracking, badge updates, and message handling
 */

import browser from 'webextension-polyfill';
import { getProfile } from '../lib/api';
import { hasAutofillData, type AutofillProfile } from '../lib/autofill';
import { ThemeColors, UserSettings, DEFAULT_COLORS } from '../lib/theme';
import { SETTINGS_STORAGE_KEY } from '../lib/theme-utils';

async function fetchThemeSettings(): Promise<ThemeColors> {
  const { appUrl, apiKey } = await browser.storage.local.get(['appUrl', 'apiKey']);

  if (!appUrl || !apiKey) {
    console.log('[Theme] Extension not configured, using default colors');
    return DEFAULT_COLORS;
  }

  try {
    console.log('[Theme] Fetching from:', `${appUrl}/users/settings`);
    const response = await fetch(`${appUrl}/users/settings`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const settings: UserSettings = await response.json();
    console.log('[Theme] Loaded theme:', settings.theme, 'accent:', settings.accent);

    // Cache settings for popup
    await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings.colors });

    return settings.colors;
  } catch (error) {
    console.error('[Theme] Fetch failed:', error);

    // Try to use cached settings
    const cached = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
    if (cached[SETTINGS_STORAGE_KEY]) {
      console.log('[Theme] Using cached colors');
      return cached[SETTINGS_STORAGE_KEY];
    }

    return DEFAULT_COLORS;
  }
}

/**
 * Get the current accent color from cached theme settings
 * Falls back to DEFAULT_COLORS if not cached
 */
async function getAccentColor(): Promise<string> {
  const cached = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
  const colors: ThemeColors = cached[SETTINGS_STORAGE_KEY] || DEFAULT_COLORS;
  return colors.accent;
}

async function updateIconColor(accentHex: string): Promise<void> {
  try {
    // Fetch the tree SVG
    const svgUrl = browser.runtime.getURL('icons/tree.svg');
    const response = await fetch(svgUrl);
    let svg = await response.text();

    // Replace fill color
    svg = svg.replace(/fill="[^"]*"/g, `fill="${accentHex}"`);

    // Create a data URL from the modified SVG
    const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

    // Use path with data URL - this works in service workers
    await browser.action.setIcon({ path: svgDataUrl });
    console.log('[Icon] Updated with accent color:', accentHex);
  } catch (error) {
    console.error('[Icon] Failed to update:', error);
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
        await updateBadge(tabId, response.isJobPage);
      }
    } catch {
      // Content script might not be loaded on this page (e.g., chrome://, extension pages)
      tabStatus.delete(tabId);
      await updateBadge(tabId, false);
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
    // Return the promise so the async updateBadge completes
    return updateBadge(sender.tab.id, message.isJobPage).then(() => undefined);
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

  // From popup: refresh theme settings
  if (message.type === 'REFRESH_THEME') {
    fetchThemeSettings().then(colors => {
      updateIconColor(colors.accent);
    });
    return Promise.resolve(undefined);
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
 * Uses accent color with checkmark for job pages, clear badge for non-job pages
 *
 * @param tabId - The tab ID to update the badge for
 * @param isJobPage - Whether the page is detected as a job posting
 */
async function updateBadge(tabId: number, isJobPage: boolean): Promise<void> {
  if (isJobPage) {
    // Show badge with accent color and checkmark for job pages
    const accentColor = await getAccentColor();
    await browser.action.setBadgeText({ text: '\u2713', tabId }); // Checkmark character
    await browser.action.setBadgeBackgroundColor({ color: accentColor, tabId });
  } else {
    // Clear badge for non-job pages
    await browser.action.setBadgeText({ text: '', tabId });
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

// Initialize theme on extension load
async function initializeTheme(): Promise<void> {
  const colors = await fetchThemeSettings();
  await updateIconColor(colors.accent);
}

initializeTheme();

export {};
