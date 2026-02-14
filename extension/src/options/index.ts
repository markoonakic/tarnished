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

// ============================================================================
// DOM Elements
// ============================================================================

const serverUrlInput = document.getElementById('serverUrl') as HTMLInputElement;
const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const apiKeyLink = document.getElementById('apiKeyLink') as HTMLAnchorElement;

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

/**
 * Load existing settings from storage and populate the form.
 */
async function loadSettings(): Promise<void> {
  try {
    const settings = await getSettings();
    serverUrlInput.value = settings.serverUrl;
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
  serverUrlInput.addEventListener('keydown', (e) => {
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
    serverUrl: serverUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
  };

  // Validate server URL
  if (!newSettings.serverUrl) {
    showStatus('Please enter a server URL', 'error');
    serverUrlInput.focus();
    return;
  }

  // Validate URL format
  try {
    new URL(newSettings.serverUrl);
  } catch {
    showStatus('Please enter a valid URL', 'error');
    serverUrlInput.focus();
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
    showStatus('Settings saved!', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Failed to save settings', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
  }
}

/**
 * Handle API key link click.
 * Opens the Job Tracker settings page in a new tab.
 */
function handleApiKeyLinkClick(e: Event): void {
  e.preventDefault();
  const serverUrl = serverUrlInput.value.trim() || 'http://localhost:8000';
  browser.tabs.create({ url: `${serverUrl}/settings/api-key` });
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
