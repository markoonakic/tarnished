/**
 * Background script for Tarnished extension
 * Manages tab state tracking, badge updates, and message handling
 */

import browser from 'webextension-polyfill';
import {
  createOffscreenIconCanvas,
  createRuntimeBitmap,
  fetchRuntimeBlob,
  updateActionIcon,
} from './icon';
import { buildActionIconPayload } from './icon-payload';
import { getProfile } from '../lib/api';
import { hasAutofillData, type AutofillProfile } from '../lib/autofill';
import { ThemeColors, UserSettings, DEFAULT_COLORS } from '../lib/theme';
import {
  getSettings,
  getThemeColorsCache,
  setThemeColorsCache,
  getAutoFillOnLoad,
} from '../lib/storage';
import { buildUrl } from '../lib/url';
import { debug, warn, error } from '../lib/logger';

async function fetchThemeSettings(): Promise<ThemeColors> {
  const { appUrl, apiKey } = await getSettings();

  if (!appUrl || !apiKey) {
    debug('Theme', 'Extension not configured, using default colors');
    return DEFAULT_COLORS;
  }

  try {
    const url = buildUrl(appUrl, '/api/users/settings');
    debug('Theme', 'Fetching from:', url);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const settings: UserSettings = await response.json();
    debug('Theme', 'Loaded theme:', settings.theme, 'accent:', settings.accent);

    // Cache settings for popup
    await setThemeColorsCache(settings.colors);

    return settings.colors;
  } catch (err) {
    error('Theme', 'Fetch failed:', err);

    // Try to use cached settings
    const cached = await getThemeColorsCache();
    if (cached !== DEFAULT_COLORS) {
      debug('Theme', 'Using cached colors');
      return cached;
    }

    return DEFAULT_COLORS;
  }
}

/**
 * Get the current accent color from cached theme settings
 * Falls back to DEFAULT_COLORS if not cached
 */
async function getAccentColor(): Promise<string> {
  const colors = await getThemeColorsCache();
  return colors.accent;
}

async function updateIconColor(accentHex: string): Promise<void> {
  await updateActionIcon({
    accentHex,
    getRuntimeUrl: (path) => browser.runtime.getURL(path),
    fetchBlob: fetchRuntimeBlob,
    createImageBitmap: createRuntimeBitmap,
    createCanvas: createOffscreenIconCanvas,
    setIcon: async (imageData) => {
      await browser.action.setIcon(buildActionIconPayload(imageData));
    },
    debug,
    error,
  });
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

// Theme fetch throttle - only fetch once every 30 seconds
let lastThemeFetch = 0;
const THEME_FETCH_INTERVAL = 30000;

// ============================================================================
// Auto-Fill Setting Management
// ============================================================================

/**
 * Load the auto-fill on load setting from storage
 */
async function loadAutoFillSetting(): Promise<void> {
  try {
    autoFillOnLoad = await getAutoFillOnLoad();
  } catch (err) {
    warn('AutoFill', 'Failed to load setting:', err);
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
      debug('AutoFill', 'Skipped: profile has no data');
      return;
    }

    // Send autofill message to content script
    await browser.tabs.sendMessage(tabId, {
      type: 'AUTOFILL_FORM',
      profile: autofillProfile,
    });

    debug('AutoFill', 'Triggered for tab', tabId);
  } catch (err) {
    // Silently fail - user may not have configured profile or API settings
    warn('AutoFill', 'Failed:', err);
  }
}

// Load setting on startup
loadAutoFillSetting();

// Listen for storage changes
browser.storage.onChanged.addListener((changes) => {
  if (changes.autoFillOnLoad !== undefined) {
    autoFillOnLoad = changes.autoFillOnLoad.newValue as boolean;
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
      const response = (await browser.tabs.sendMessage(tabId, {
        type: 'GET_DETECTION',
      })) as { isJobPage?: boolean; score?: number; signals?: string[] };

      if (response) {
        tabStatus.set(tabId, {
          isJobPage: response.isJobPage ?? false,
          score: response.score ?? 0,
          signals: response.signals ?? [],
          url: tab.url,
        });
        await updateBadge(tabId, response.isJobPage ?? false);
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
browser.runtime.onMessage.addListener(
  (message: unknown, sender: { tab?: { id?: number } }) => {
    const msg = message as { type: string; [key: string]: unknown };

    // From content script: detection result
    if (msg.type === 'DETECTION_RESULT' && sender.tab?.id) {
      const detectionMsg = msg as unknown as {
        isJobPage: boolean;
        score: number;
        signals: string[];
        url: string;
      };
      tabStatus.set(sender.tab.id, {
        isJobPage: detectionMsg.isJobPage,
        score: detectionMsg.score,
        signals: detectionMsg.signals,
        url: detectionMsg.url,
      });
      // Return the promise so the async updateBadge completes
      return updateBadge(sender.tab.id, detectionMsg.isJobPage).then(
        () => undefined
      );
    }

    // From content script: form detection update (for auto-fill on load)
    if (msg.type === 'FORM_DETECTION_UPDATE' && sender.tab?.id) {
      const formMsg = msg as unknown as {
        hasApplicationForm: boolean;
        fillableFieldCount: number;
      };
      const tabId = sender.tab.id;

      debug('FormDetection', 'Update:', {
        tabId,
        hasApplicationForm: formMsg.hasApplicationForm,
        fillableFieldCount: formMsg.fillableFieldCount,
        autoFillOnLoad,
      });

      // Store form detection state for this tab
      tabFormDetectionState.set(tabId, {
        hasApplicationForm: formMsg.hasApplicationForm,
        fillableFieldCount: formMsg.fillableFieldCount,
      });

      // If auto-fill on load is enabled and form detected with enough fields, trigger autofill
      if (
        autoFillOnLoad &&
        formMsg.hasApplicationForm &&
        formMsg.fillableFieldCount >= 2
      ) {
        debug('FormDetection', 'Triggering auto-fill for tab', tabId);
        // Small delay to ensure the form is fully rendered
        setTimeout(() => {
          triggerAutoFill(tabId);
        }, 100);
      }

      return Promise.resolve(undefined);
    }

    // From popup: get tab status
    if (msg.type === 'GET_TAB_STATUS') {
      const statusMsg = msg as unknown as { tabId: number };
      return Promise.resolve(tabStatus.get(statusMsg.tabId) || null);
    }

    // From popup: refresh theme settings (throttled)
    if (msg.type === 'REFRESH_THEME') {
      const now = Date.now();
      if (now - lastThemeFetch > THEME_FETCH_INTERVAL) {
        lastThemeFetch = now;
        fetchThemeSettings().then(async (colors) => {
          updateIconColor(colors.accent);
          // Update badge color for all tabs that have job pages
          const accentColor = colors.accent;
          for (const [tabId, status] of tabStatus.entries()) {
            if (status.isJobPage) {
              await browser.action.setBadgeBackgroundColor({
                color: accentColor,
                tabId: Number(tabId),
              });
            }
          }
        });
      }
      return Promise.resolve(undefined);
    }

    // From content script: request injection into iframe
    if (msg.type === 'INJECT_INTO_IFRAME' && sender.tab?.id) {
      const iframeMsg = msg as unknown as { frameSrc: string };
      // We need to use scripting API to inject into iframes
      // Note: This requires the iframe to be same-origin with a host_permissions match
      // For truly cross-origin iframes, the content script already handles it via postMessage
      debug('Iframe', 'Injection request:', iframeMsg.frameSrc);

      // Store the frame src for potential retry
      const tabId = sender.tab.id;
      if (!pendingIframeInjections.has(tabId)) {
        pendingIframeInjections.set(tabId, []);
      }
      pendingIframeInjections.get(tabId)?.push(iframeMsg.frameSrc);

      return Promise.resolve({ success: true });
    }

    return Promise.resolve(undefined);
  }
);

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
