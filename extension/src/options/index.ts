/**
 * Options page script for Tarnished extension.
 *
 * This script handles:
 * - Loading existing settings from storage
 * - Saving new settings to storage
 * - Validation of user input
 * - User feedback on save operations
 * - Dynamic favicon with theme accent color
 */

import browser from 'webextension-polyfill';
import { getSettings, setSettings, type Settings } from '../lib/storage';
import { getThemeColors, applyThemeToDocument } from '../lib/theme-utils';
import { normalizeBaseUrl } from '../lib/url';

// ============================================================================
// DOM Elements
// ============================================================================

const appUrlInput = document.getElementById('appUrl') as HTMLInputElement;
const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const apiKeyLink = document.getElementById('apiKeyLink') as HTMLAnchorElement;

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Apply theme first (before any UI renders)
  try {
    const colors = await getThemeColors();
    applyThemeToDocument(colors);
    console.log('[Options] Applied theme, accent:', colors.accent);

    // Update favicon with accent color
    await updateFavicon(colors.accent);
  } catch (error) {
    console.warn('[Options] Failed to load theme:', error);
  }

  await loadSettings();
  setupEventListeners();
});

/**
 * Update the page favicon with the accent color
 */
async function updateFavicon(accentColor: string): Promise<void> {
  try {
    // Fetch the tree SVG
    const svgUrl = browser.runtime.getURL('icons/tree.svg');
    const response = await fetch(svgUrl);
    let svg = await response.text();

    // Replace fill color with accent color
    svg = svg.replace(/fill="[^"]*"/g, `fill="${accentColor}"`);

    // Create data URL
    const svgDataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;

    // Update favicon
    const favicon = document.querySelector(
      'link[rel="icon"]'
    ) as HTMLLinkElement;
    if (favicon) {
      favicon.href = svgDataUrl;
    }

    console.log('[Options] Updated favicon with accent color:', accentColor);
  } catch (error) {
    console.warn('[Options] Failed to update favicon:', error);
  }
}

/**
 * Load existing settings from storage and populate the form.
 */
async function loadSettings(): Promise<void> {
  try {
    const settings = await getSettings();
    appUrlInput.value = settings.appUrl;
    apiKeyInput.value = settings.apiKey;
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

/**
 * Set up event listeners for the options page.
 */
function setupEventListeners(): void {
  // Save button click handler
  saveBtn.addEventListener('click', handleSave);

  // API key link click handler
  apiKeyLink.addEventListener('click', handleApiKeyLinkClick);

  // Enter key handler for inputs
  appUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  });
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  });
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle save button click.
 */
async function handleSave(): Promise<void> {
  const newSettings: Settings = {
    appUrl: normalizeBaseUrl(appUrlInput.value.trim()),
    apiKey: apiKeyInput.value.trim(),
  };

  // Validate app URL
  if (!newSettings.appUrl) {
    appUrlInput.focus();
    return;
  }

  // Validate URL format
  try {
    new URL(newSettings.appUrl);
  } catch {
    appUrlInput.focus();
    return;
  }

  // Validate API key
  if (!newSettings.apiKey) {
    apiKeyInput.focus();
    return;
  }

  // Disable save button while saving
  saveBtn.disabled = true;
  const originalWidth = saveBtn.offsetWidth;
  saveBtn.style.width = `${originalWidth}px`;
  saveBtn.textContent = 'Saving...';

  try {
    await setSettings(newSettings);
    // Show "Saved!" briefly on button
    saveBtn.textContent = 'Saved!';
    // Revert button after 1.5 seconds
    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.style.width = '';
      saveBtn.textContent = 'Save';
    }, 1500);
  } catch (error) {
    console.error('Failed to save settings:', error);
    saveBtn.disabled = false;
    saveBtn.style.width = '';
    saveBtn.textContent = 'Error!';
    setTimeout(() => {
      saveBtn.textContent = 'Save';
    }, 1500);
  }
}

/**
 * Handle API key link click.
 * Opens the Tarnished settings page in a new tab.
 */
function handleApiKeyLinkClick(e: Event): void {
  e.preventDefault();
  const appUrl = appUrlInput.value.trim();
  if (appUrl) {
    browser.tabs.create({ url: `${appUrl}/settings/api-key` });
  }
}

// Export for module detection
export {};
