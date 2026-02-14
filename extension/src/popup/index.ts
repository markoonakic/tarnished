/**
 * Popup script for Job Tracker extension
 * Handles the popup UI state management and user interactions
 *
 * This is a placeholder - full logic will be implemented in Task 21
 */

// Popup state types
type PopupState =
  | 'loading'
  | 'no-settings'
  | 'not-detected'
  | 'detected'
  | 'saved'
  | 'update'
  | 'saving'
  | 'error';

// DOM element references
const elements = {
  // State containers
  stateLoading: document.getElementById('state-loading'),
  stateNoSettings: document.getElementById('state-no-settings'),
  stateNotDetected: document.getElementById('state-not-detected'),
  stateDetected: document.getElementById('state-detected'),
  stateSaved: document.getElementById('state-saved'),
  stateUpdate: document.getElementById('state-update'),
  stateSaving: document.getElementById('state-saving'),
  stateError: document.getElementById('state-error'),

  // Buttons
  settingsBtn: document.getElementById('settingsBtn'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),
  saveBtn: document.getElementById('saveBtn'),
  viewBtn: document.getElementById('viewBtn'),
  updateBtn: document.getElementById('updateBtn'),
  retryBtn: document.getElementById('retryBtn'),

  // Job info displays
  jobTitle: document.getElementById('jobTitle'),
  jobCompany: document.getElementById('jobCompany'),
  jobLocation: document.getElementById('jobLocation'),
  savedJobTitle: document.getElementById('savedJobTitle'),
  savedJobCompany: document.getElementById('savedJobCompany'),
  savedJobLocation: document.getElementById('savedJobLocation'),
  updateJobTitle: document.getElementById('updateJobTitle'),
  updateJobCompany: document.getElementById('updateJobCompany'),
  updateJobLocation: document.getElementById('updateJobLocation'),

  // Error display
  errorText: document.getElementById('errorText'),
};

// State container mapping
const stateContainers: Record<PopupState, HTMLElement | null> = {
  loading: elements.stateLoading,
  'no-settings': elements.stateNoSettings,
  'not-detected': elements.stateNotDetected,
  detected: elements.stateDetected,
  saved: elements.stateSaved,
  update: elements.stateUpdate,
  saving: elements.stateSaving,
  error: elements.stateError,
};

/**
 * Shows the specified state and hides all others
 */
function showState(state: PopupState): void {
  // Hide all states
  Object.values(stateContainers).forEach((container) => {
    if (container) {
      container.classList.add('hidden');
    }
  });

  // Show the requested state
  const targetContainer = stateContainers[state];
  if (targetContainer) {
    targetContainer.classList.remove('hidden');
  }
}

/**
 * Opens the extension settings/options page
 */
function openSettings(): void {
  if (chrome.runtime && chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    console.error('chrome.runtime.openOptionsPage not available');
  }
}

/**
 * Initializes the popup
 * Full implementation will be in Task 21
 */
function init(): void {
  console.log('Job Tracker popup loaded');

  // Set up button click handlers
  elements.settingsBtn?.addEventListener('click', openSettings);
  elements.openSettingsBtn?.addEventListener('click', openSettings);

  elements.saveBtn?.addEventListener('click', () => {
    console.log('Save button clicked - will be implemented in Task 21');
  });

  elements.viewBtn?.addEventListener('click', () => {
    console.log('View button clicked - will be implemented in Task 21');
  });

  elements.updateBtn?.addEventListener('click', () => {
    console.log('Update button clicked - will be implemented in Task 21');
  });

  elements.retryBtn?.addEventListener('click', () => {
    console.log('Retry button clicked - will be implemented in Task 21');
  });

  // Show loading state initially
  // Full state detection logic will be implemented in Task 21
  showState('loading');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

export {};
