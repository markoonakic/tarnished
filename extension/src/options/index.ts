/**
 * Options page script for Job Tracker extension.
 *
 * This script handles:
 * - Loading existing settings from storage
 * - Saving new settings to storage
 * - Validation of user input
 * - Connection testing
 * - User feedback on save operations
 */

import browser from 'webextension-polyfill';
import { getSettings, setSettings, type Settings } from '../lib/storage';
import { getThemeColors, applyThemeToDocument } from '../lib/theme-utils';

// ============================================================================
// DOM Elements
// ============================================================================

const appUrlInput = document.getElementById('appUrl') as HTMLInputElement;
const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const apiKeyLink = document.getElementById('apiKeyLink') as HTMLAnchorElement;

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Apply theme first (before any UI renders)
  try {
    const colors = await getThemeColors();
    applyThemeToDocument(colors);
    console.log('[Options] Applied theme');
  } catch (error) {
    console.warn('[Options] Failed to load theme:', error);
  }

  await loadSettings();
  setupEventListeners();
});

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
    showStatus('Failed to load settings', 'error');
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
    appUrl: appUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
  };

  // Validate app URL
  if (!newSettings.appUrl) {
    showStatus('Please enter an App URL', 'error');
    appUrlInput.focus();
    return;
  }

  // Validate URL format
  try {
    new URL(newSettings.appUrl);
  } catch {
    showStatus('Please enter a valid URL', 'error');
    appUrlInput.focus();
    return;
  }

  // Validate API key
  if (!newSettings.apiKey) {
    showStatus('Please enter an API key', 'error');
    apiKeyInput.focus();
    return;
  }

  // Disable save button while saving
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    await setSettings(newSettings);
    // Show "Saved!" briefly on button
    saveBtn.textContent = 'Saved!';
    // Clear status element entirely
    statusEl.textContent = '';
    statusEl.className = '';
    // Revert button after 1.5 seconds
    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Settings';
    }, 1500);
  } catch (error) {
    console.error('Failed to save settings:', error);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
    showStatus('Failed to save settings', 'error');
  }
}

/**
 * Handle API key link click.
 * Opens the Job Tracker settings page in a new tab.
 */
function handleApiKeyLinkClick(e: Event): void {
  e.preventDefault();
  const appUrl = appUrlInput.value.trim();
  if (appUrl) {
    browser.tabs.create({ url: `${appUrl}/settings/api-key` });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Show a status message to the user.
 *
 * @param message - The message to display
 * @param type - The type of message (success or error)
 */
function showStatus(message: string, type: 'success' | 'error'): void {
  statusEl.textContent = message;
  statusEl.className = type;

  // Clear status after 3 seconds
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = '';
  }, 3000);
}

// Export for module detection
export {};
