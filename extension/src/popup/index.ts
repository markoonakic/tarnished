/**
 * Popup script for Job Tracker extension
 * Handles the popup UI state management and user interactions
 */

import browser from 'webextension-polyfill';
import { getSettings, type Settings } from '../lib/storage';
import {
  checkExistingLead,
  getProfile,
  extractApplication,
  getStatuses,
  type JobLeadResponse,
  type StatusResponse,
} from '../lib/api';
import { hasAutofillData, type AutofillProfile } from '../lib/autofill';
import { getErrorMessage, isRecoverable, mapApiError } from '../lib/errors';
import { getThemeColors, applyThemeToDocument } from './lib/theme';

// ============================================================================
// Types
// ============================================================================

/**
 * Popup state types
 */
type PopupState =
  | 'loading'
  | 'no-settings'
  | 'not-detected'
  | 'detected'
  | 'saved'
  | 'saving'
  | 'error';

/**
 * Tab status from background script
 */
interface TabStatus {
  isJobPage: boolean;
  score: number;
  signals: string[];
  url: string;
}

/**
 * Form detection state from content script
 */
interface FormDetectionState {
  hasApplicationForm: boolean;
  fillableFieldCount: number;
}

/**
 * Job info to display in the UI
 */
interface JobInfo {
  title: string | null;
  company: string | null;
  location: string | null;
}

// ============================================================================
// State
// ============================================================================

/** Current job info for detected jobs */
let currentJobInfo: JobInfo = { title: null, company: null, location: null };

/** Current tab ID */
let currentTabId: number | null = null;

/** Current tab URL */
let currentTabUrl: string | null = null;

/** Existing lead info (if any) */
let existingLead: JobLeadResponse | null = null;

/** Form detection state */
let formDetection: FormDetectionState = {
  hasApplicationForm: false,
  fillableFieldCount: 0,
};

/** Settings dropdown open state */
let settingsOpen = false;

/** Auto-fill on page load setting */
let autoFillOnLoad = false;

/** Cached "Applied" status ID */
let appliedStatusId: string | null = null;

/** Current popup state (for message handler updates) */
let currentState: PopupState = 'loading';

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  // State containers
  stateLoading: document.getElementById('state-loading'),
  stateNoSettings: document.getElementById('state-no-settings'),
  stateNotDetected: document.getElementById('state-not-detected'),
  stateDetected: document.getElementById('state-detected'),
  stateSaved: document.getElementById('state-saved'),
  stateSaving: document.getElementById('state-saving'),
  stateError: document.getElementById('state-error'),

  // Buttons
  settingsBtn: document.getElementById('settingsBtn'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),
  saveAsLeadBtn: document.getElementById('saveAsLeadBtn'),
  saveAsApplicationBtn: document.getElementById('saveAsApplicationBtn'),
  viewBtn: document.getElementById('viewBtn'),
  retryBtn: document.getElementById('retryBtn'),
  autofillBtnDetected: document.getElementById('autofillBtnDetected'),
  autofillBtnSaved: document.getElementById('autofillBtnSaved'),
  autofillBtnOnly: document.getElementById('autofillBtnOnly'),

  // Settings dropdown
  settingsDropdown: document.getElementById('settingsDropdown'),
  autoFillToggle: document.getElementById('autoFillToggle') as HTMLInputElement | null,
  openSettingsFromDropdown: document.getElementById('openSettingsFromDropdown'),

  // Autofill sections
  autofillDetectedSection: document.getElementById('autofillDetectedSection'),
  autofillSavedSection: document.getElementById('autofillSavedSection'),
  autofillOnlySection: document.getElementById('autofillOnlySection'),
  autofillDetectedCount: document.getElementById('autofillDetectedCount'),
  autofillSavedCount: document.getElementById('autofillSavedCount'),
  autofillOnlyCount: document.getElementById('autofillOnlyCount'),

  // Job info displays
  jobTitle: document.getElementById('jobTitle'),
  jobCompany: document.getElementById('jobCompany'),
  jobLocation: document.getElementById('jobLocation'),
  savedJobTitle: document.getElementById('savedJobTitle'),
  savedJobCompany: document.getElementById('savedJobCompany'),
  savedJobLocation: document.getElementById('savedJobLocation'),
  savedMessage: document.getElementById('savedMessage'),

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
  saving: elements.stateSaving,
  error: elements.stateError,
};

// ============================================================================
// State Management
// ============================================================================

/**
 * Shows the specified state and hides all others
 */
function showState(state: PopupState): void {
  // Update current state tracking
  currentState = state;

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

  // Update autofill section visibility based on form detection
  updateAutofillVisibility(state);
}

/**
 * Updates the visibility of autofill sections based on form detection state
 */
function updateAutofillVisibility(state: PopupState): void {
  // Show autofill section if we have at least 1 fillable field OR if we detected an application form
  const showAutofill = formDetection.hasApplicationForm || formDetection.fillableFieldCount >= 1;

  // Update field counts
  const countText = `${formDetection.fillableFieldCount} field${formDetection.fillableFieldCount !== 1 ? 's' : ''}`;
  if (elements.autofillDetectedCount) {
    elements.autofillDetectedCount.textContent = countText;
  }
  if (elements.autofillSavedCount) {
    elements.autofillSavedCount.textContent = countText;
  }
  if (elements.autofillOnlyCount) {
    elements.autofillOnlyCount.textContent = countText;
  }

  // Show/hide sections based on state
  if (state === 'detected' && elements.autofillDetectedSection) {
    elements.autofillDetectedSection.classList.toggle('hidden', !showAutofill);
  }
  if (state === 'saved' && elements.autofillSavedSection) {
    elements.autofillSavedSection.classList.toggle('hidden', !showAutofill);
  }
  if (state === 'not-detected' && elements.autofillOnlySection) {
    elements.autofillOnlySection.classList.toggle('hidden', !showAutofill);
  }
}

/**
 * Update job info display in the UI
 */
function updateJobInfoDisplay(info: JobInfo, prefix: 'job' | 'savedJob'): void {
  const titleEl = elements[`${prefix}Title` as keyof typeof elements] as HTMLElement | null;
  const companyEl = elements[`${prefix}Company` as keyof typeof elements] as HTMLElement | null;
  const locationEl = elements[`${prefix}Location` as keyof typeof elements] as HTMLElement | null;

  if (titleEl) {
    titleEl.textContent = info.title || 'Unknown Position';
  }
  if (companyEl) {
    companyEl.textContent = info.company || '';
  }
  if (locationEl) {
    locationEl.textContent = info.location || '';
  }
}

/**
 * Shows the error state with a specific message
 */
function showError(message: string, recoverable: boolean = true): void {
  if (elements.errorText) {
    elements.errorText.textContent = message;
  }

  // Show/hide retry button based on recoverability
  if (elements.retryBtn) {
    elements.retryBtn.classList.toggle('hidden', !recoverable);
  }

  showState('error');
}

// ============================================================================
// Settings Dropdown
// ============================================================================

/**
 * Toggles the settings dropdown visibility
 */
function toggleSettingsDropdown(): void {
  settingsOpen = !settingsOpen;
  if (elements.settingsDropdown) {
    elements.settingsDropdown.classList.toggle('hidden', !settingsOpen);
  }
}

/**
 * Closes the settings dropdown if clicking outside
 */
function handleDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  // Don't close if clicking inside the dropdown or on the settings button
  if (
    settingsOpen &&
    elements.settingsBtn &&
    !elements.settingsBtn.contains(target) &&
    elements.settingsDropdown &&
    !elements.settingsDropdown.contains(target)
  ) {
    settingsOpen = false;
    elements.settingsDropdown.classList.add('hidden');
  }
}

/**
 * Handles the auto-fill toggle change
 */
async function handleAutoFillToggle(): Promise<void> {
  autoFillOnLoad = elements.autoFillToggle?.checked ?? false;

  // Save to storage
  try {
    await browser.storage.local.set({ autoFillOnLoad });
  } catch (error) {
    console.warn('Failed to save autoFillOnLoad setting:', error);
  }
}

/**
 * Loads the auto-fill on load setting from storage
 */
async function loadAutoFillSetting(): Promise<void> {
  try {
    const result = await browser.storage.local.get('autoFillOnLoad');
    autoFillOnLoad = result.autoFillOnLoad ?? false;
    if (elements.autoFillToggle) {
      elements.autoFillToggle.checked = autoFillOnLoad;
    }
  } catch (error) {
    console.warn('Failed to load autoFillOnLoad setting:', error);
  }
}

// ============================================================================
// Notifications
// ============================================================================

/**
 * Show a browser notification
 */
async function showNotification(
  title: string,
  message: string
): Promise<void> {
  try {
    await browser.notifications.create({
      type: 'basic',
      iconUrl: '/icons/icon48.png',
      title,
      message,
    });
  } catch (error) {
    console.warn('Failed to show notification:', error);
  }
}

/**
 * Show a success notification for saved job lead
 */
function showSuccessNotification(title: string | null, company: string | null): void {
  const jobTitle = title || 'Job Lead';
  const companyText = company ? ` at ${company}` : '';
  showNotification('Job Saved!', `${jobTitle}${companyText} has been saved to Job Leads.`);
}

/**
 * Show a success notification for saved application
 */
function showApplicationSuccessNotification(title: string | null, company: string | null): void {
  const jobTitle = title || 'Application';
  const companyText = company ? ` at ${company}` : '';
  showNotification('Application Added!', `${jobTitle}${companyText} has been added as an application.`);
}

/**
 * Show an error notification
 */
function showErrorNotification(message: string): void {
  showNotification('Error', message);
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Opens the extension settings/options page
 */
function openSettings(): void {
  browser.runtime.openOptionsPage().catch((error) => {
    console.error('Failed to open settings:', error);
  });
}

/**
 * Opens the Job Leads page in the web app
 */
function openJobLeads(): void {
  getSettings()
    .then((settings: Settings) => {
      const url = existingLead
        ? `${settings.appUrl}/job-leads/${existingLead.id}`
        : `${settings.appUrl}/job-leads`;
      browser.tabs.create({ url }).catch((error) => {
        console.error('Failed to open job leads:', error);
      });
    })
    .catch((error) => {
      console.error('Failed to get settings for opening job leads:', error);
    });
}

/**
 * Opens the Applications page in the web app
 */
function openApplications(applicationId?: string): void {
  getSettings()
    .then((settings: Settings) => {
      const url = applicationId
        ? `${settings.appUrl}/applications/${applicationId}`
        : `${settings.appUrl}/applications`;
      browser.tabs.create({ url }).catch((error) => {
        console.error('Failed to open applications:', error);
      });
    })
    .catch((error) => {
      console.error('Failed to get settings for opening applications:', error);
    });
}

/**
 * Saves the current job lead to the backend
 */
async function saveJobLead(): Promise<void> {
  if (!currentTabUrl) {
    const errorMsg = 'No URL to save';
    showError(errorMsg);
    showErrorNotification(errorMsg);
    return;
  }

  showState('saving');

  try {
    // Get text content from content script (preferred over HTML)
    const text = await getTextFromContentScript();

    // Import the save function
    const { saveJobLead: saveLead } = await import('../lib/api');
    const result = await saveLead(currentTabUrl, text);

    // Update existing lead info
    existingLead = result;
    currentJobInfo = {
      title: result.title,
      company: result.company,
      location: result.location || null,
    };

    // Update cached job status to reflect that this job is now saved
    const { setJobStatus } = await import('../lib/storage');
    await setJobStatus(currentTabUrl, {
      url: currentTabUrl,
      isJobPage: true,
      existingLeadId: result.id,
      title: result.title,
      company: result.company,
    });

    // Show success notification
    showSuccessNotification(result.title, result.company);

    // Update saved message and show saved state
    if (elements.savedMessage) {
      elements.savedMessage.textContent = 'Saved to Job Leads';
    }
    updateJobInfoDisplay(currentJobInfo, 'savedJob');
    showState('saved');
  } catch (error) {
    // Map API errors to user-friendly messages
    const extensionError = mapApiError(error);
    const message = getErrorMessage(extensionError);
    showError(message, isRecoverable(extensionError));
    showErrorNotification(message);
  }
}

/**
 * Gets the "Applied" status ID from the backend (cached)
 */
async function getAppliedStatusId(): Promise<string | null> {
  if (appliedStatusId) {
    return appliedStatusId;
  }

  try {
    const statuses: StatusResponse[] = await getStatuses();
    const appliedStatus = statuses.find(
      (s) => s.name.toLowerCase() === 'applied'
    );
    if (appliedStatus) {
      appliedStatusId = appliedStatus.id;
    }
    return appliedStatusId;
  } catch (error) {
    console.warn('Failed to get statuses:', error);
    return null;
  }
}

/**
 * Saves the job directly as an application with "Applied" status
 */
async function saveAsApplication(): Promise<void> {
  if (!currentTabUrl) {
    const errorMsg = 'No URL to save';
    showError(errorMsg);
    showErrorNotification(errorMsg);
    return;
  }

  showState('saving');

  try {
    // Get the "Applied" status ID
    const statusId = await getAppliedStatusId();
    if (!statusId) {
      const errorMsg = 'Could not find "Applied" status. Please ensure it exists in your application settings.';
      showError(errorMsg, true);
      showErrorNotification(errorMsg);
      return;
    }

    // Get text content from content script (same as job leads)
    let text: string | undefined;
    try {
      text = await getTextFromContentScript();
      console.log('Got text from content script:', text?.substring(0, 100));
    } catch (e) {
      console.warn('Failed to get text from content script:', e);
      // Continue without text - backend will try to fetch HTML
    }

    console.log('Calling extractApplication with text:', !!text, 'length:', text?.length);

    // Extract and create application using server-side LLM extraction
    const result = await extractApplication({
      url: currentTabUrl,
      status_id: statusId,
      applied_at: new Date().toISOString().split('T')[0],
      text,
    });

    // Show success notification
    showApplicationSuccessNotification(result.job_title, result.company);

    // Update saved message and show saved state
    if (elements.savedMessage) {
      elements.savedMessage.textContent = 'Added as Application';
    }
    currentJobInfo = {
      title: result.job_title,
      company: result.company,
      location: null,
    };
    updateJobInfoDisplay(currentJobInfo, 'savedJob');

    // Update view button to open applications page
    if (elements.viewBtn) {
      elements.viewBtn.textContent = 'View in App';
      // Store the application ID for viewing
      elements.viewBtn.dataset.applicationId = result.id;
    }

    showState('saved');
  } catch (error) {
    const extensionError = mapApiError(error);
    const message = getErrorMessage(extensionError);
    showError(message, isRecoverable(extensionError));
    showErrorNotification(message);
  }
}

/**
 * Retries the last failed action
 */
async function retryAction(): Promise<void> {
  // Re-determine the state
  await determineState();
}

/**
 * Autofills the form on the current page with user profile data.
 * Fetches the profile from the backend and sends it to the content script
 * for autofill.
 */
async function autofillFormHandler(): Promise<void> {
  if (!currentTabId) {
    showErrorNotification('No active tab');
    return;
  }

  try {
    // Fetch profile from backend
    const profile = await getProfile();

    // Check if profile has any data
    const autofillProfile: AutofillProfile = {
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      phone: profile.phone,
      city: profile.city,
      country: profile.country,
      linkedin_url: profile.linkedin_url,
    };

    if (!hasAutofillData(autofillProfile)) {
      showErrorNotification('Set up your profile in the app to enable autofill');
      return;
    }

    // Send autofill request to content script
    const response = await browser.tabs.sendMessage(currentTabId, {
      type: 'AUTOFILL_FORM',
      profile: autofillProfile,
    });

    if (response && typeof response.filledCount === 'number') {
      if (response.filledCount > 0) {
        showNotification('Autofill Complete', `Filled ${response.filledCount} field${response.filledCount !== 1 ? 's' : ''}.`);
      } else {
        showNotification('No Fields Found', 'No empty form fields found to fill.');
      }
    } else {
      showNotification('Autofill Failed', 'Could not complete autofill. Try refreshing the page.');
    }
  } catch (error) {
    const extensionError = mapApiError(error);
    const message = getErrorMessage(extensionError);
    showErrorNotification(message);
  }
}

// ============================================================================
// Content Script Communication
// ============================================================================

/**
 * Get text content from the content script
 */
async function getTextFromContentScript(): Promise<string> {
  if (!currentTabId) {
    throw new Error('No active tab');
  }

  try {
    const response = await browser.tabs.sendMessage(currentTabId, {
      type: 'GET_TEXT',
    });

    if (response && response.text) {
      return response.text;
    }

    throw new Error('No text content received');
  } catch (error) {
    throw new Error('Failed to get page content');
  }
}

/**
 * Get form detection state from content script
 */
async function getFormDetectionFromContentScript(): Promise<FormDetectionState | null> {
  if (!currentTabId) {
    return null;
  }

  try {
    const response = await browser.tabs.sendMessage(currentTabId, {
      type: 'SCAN_FIELDS',
    });

    if (response && typeof response.fillableFieldCount === 'number') {
      return {
        hasApplicationForm: response.hasApplicationForm ?? false,
        fillableFieldCount: response.fillableFieldCount,
      };
    }

    return null;
  } catch (error) {
    console.warn('Failed to get form detection from content script:', error);
    return null;
  }
}

// ============================================================================
// State Determination
// ============================================================================

/**
 * Main state determination logic
 * Determines which state to show based on settings, detection, and existing leads
 */
async function determineState(): Promise<void> {
  showState('loading');

  try {
    // Step 1: Check if settings are configured
    const settings = await getSettings();
    if (!settings.appUrl || !settings.apiKey) {
      showState('no-settings');
      return;
    }

    // Step 2: Get current tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];

    if (!currentTab || !currentTab.id || !currentTab.url) {
      showError('No active tab found');
      return;
    }

    currentTabId = currentTab.id;
    currentTabUrl = currentTab.url;

    // Step 3: Check for restricted URLs
    if (isRestrictedUrl(currentTabUrl)) {
      showError('Cannot access this page (restricted URL)');
      return;
    }

    // Step 4: Get detection status from background script
    let tabStatus: TabStatus | null = null;
    try {
      tabStatus = await browser.runtime.sendMessage({
        type: 'GET_TAB_STATUS',
        tabId: currentTabId,
      });
    } catch (error) {
      console.warn('Failed to get tab status from background:', error);
    }

    // Fallback: If no cached status, request detection directly from content script
    if (!tabStatus) {
      try {
        const detectionResult = await browser.tabs.sendMessage(currentTabId, {
          type: 'GET_DETECTION',
        });
        if (detectionResult) {
          tabStatus = {
            isJobPage: detectionResult.isJobPage,
            score: detectionResult.score,
            signals: detectionResult.signals,
            url: currentTabUrl,
          };
        }
      } catch (error) {
        console.warn('Failed to get detection from content script:', error);
      }
    }

    // Step 5: Get form detection state
    const formDetectionResult = await getFormDetectionFromContentScript();
    if (formDetectionResult) {
      formDetection = formDetectionResult;
    }

    // Step 6: Check if this URL already exists as a job lead
    try {
      existingLead = await checkExistingLead(currentTabUrl);
    } catch (error) {
      console.warn('Failed to check existing lead:', error);
      // Continue without existing lead info - user can still try to save
    }

    // Step 7: Determine the state to show
    if (existingLead) {
      // URL already saved - just show saved state
      currentJobInfo = {
        title: existingLead.title,
        company: existingLead.company,
        location: existingLead.location || null,
      };
      if (elements.savedMessage) {
        elements.savedMessage.textContent = 'Saved to Job Leads';
      }
      updateJobInfoDisplay(currentJobInfo, 'savedJob');
      showState('saved');
    } else if (tabStatus && tabStatus.isJobPage) {
      // Job detected and not yet saved
      // Extract job info from detection signals (placeholder for now)
      currentJobInfo = {
        title: extractTitleFromPage(),
        company: extractCompanyFromPage(),
        location: extractLocationFromPage(),
      };
      updateJobInfoDisplay(currentJobInfo, 'job');
      showState('detected');
    } else {
      // Not a job page
      showState('not-detected');
    }
  } catch (error) {
    const message = getErrorMessage(error);
    const recoverable = isRecoverable(error);
    showError(message, recoverable);
  }
}

/**
 * Check if URL is restricted (chrome://, about:, etc.)
 */
function isRestrictedUrl(url: string): boolean {
  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'about:',
    'edge://',
    'brave://',
    'opera://',
    'vivaldi://',
    'moz-extension://',
    'resource://',
  ];

  return restrictedPrefixes.some((prefix) => url.startsWith(prefix));
}

/**
 * Extract job title from page (placeholder implementation)
 * Uses common selectors to find job title
 */
function extractTitleFromPage(): string | null {
  // Try common job title selectors
  const selectors = [
    '[data-testid="job-title"]',
    '.job-title',
    '.jobTitle',
    'h1[data-job-id]',
    'h1.job-search-title',
    '.posting-headline h2',
    '.job-posting h1',
    'h1.title',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent) {
      return element.textContent.trim();
    }
  }

  return null;
}

/**
 * Extract company name from page (placeholder implementation)
 */
function extractCompanyFromPage(): string | null {
  const selectors = [
    '[data-testid="company-name"]',
    '.company-name',
    '.companyName',
    '.posting-headline .company',
    '.job-posting .company',
    '.company-link',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent) {
      return element.textContent.trim();
    }
  }

  return null;
}

/**
 * Extract location from page (placeholder implementation)
 */
function extractLocationFromPage(): string | null {
  const selectors = [
    '[data-testid="job-location"]',
    '.job-location',
    '.location',
    '.jobLocation',
    '.posting-headline .location',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent) {
      return element.textContent.trim();
    }
  }

  return null;
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Set up button click handlers
 */
function setupEventListeners(): void {
  // Settings
  elements.settingsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettingsDropdown();
  });
  elements.openSettingsBtn?.addEventListener('click', openSettings);
  elements.openSettingsFromDropdown?.addEventListener('click', () => {
    // Close dropdown and open settings
    settingsOpen = false;
    if (elements.settingsDropdown) {
      elements.settingsDropdown.classList.add('hidden');
    }
    openSettings();
  });
  elements.autoFillToggle?.addEventListener('change', handleAutoFillToggle);

  // Close dropdown when clicking outside
  document.addEventListener('click', handleDocumentClick);

  // Job actions
  elements.saveAsLeadBtn?.addEventListener('click', saveJobLead);
  elements.saveAsApplicationBtn?.addEventListener('click', saveAsApplication);
  elements.viewBtn?.addEventListener('click', () => {
    const applicationId = elements.viewBtn?.dataset.applicationId;
    if (applicationId) {
      openApplications(applicationId);
    } else {
      openJobLeads();
    }
  });
  elements.retryBtn?.addEventListener('click', retryAction);

  // Autofill buttons
  elements.autofillBtnDetected?.addEventListener('click', autofillFormHandler);
  elements.autofillBtnSaved?.addEventListener('click', autofillFormHandler);
  elements.autofillBtnOnly?.addEventListener('click', autofillFormHandler);
}

/**
 * Initialize the popup
 */
async function init(): Promise<void> {
  // Load and apply theme colors
  try {
    const colors = await getThemeColors();
    applyThemeToDocument(colors);
    console.log('[Popup] Applied theme, accent:', colors.accent);
  } catch (error) {
    console.warn('Failed to load theme:', error);
  }

  // Trigger background refresh for next time
  browser.runtime.sendMessage({ type: 'REFRESH_THEME' });

  // Load auto-fill setting
  await loadAutoFillSetting();

  // Set up event listeners
  setupEventListeners();

  // Determine and show the appropriate state
  await determineState();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('Failed to initialize popup:', error);
    showError('Failed to initialize');
  });
});

// ============================================================================
// Runtime Message Listener
// ============================================================================

/**
 * Listen for FORM_DETECTION_UPDATE messages from content script
 * This allows the popup to update its UI when forms are dynamically detected
 */
browser.runtime.onMessage.addListener(
  (message: { type: string; hasApplicationForm?: boolean; fillableFieldCount?: number }) => {
    if (message.type === 'FORM_DETECTION_UPDATE') {
      formDetection = {
        hasApplicationForm: message.hasApplicationForm ?? false,
        fillableFieldCount: message.fillableFieldCount ?? 0,
      };
      // Update autofill visibility based on new form detection state
      updateAutofillVisibility(currentState);
    }
  }
);

// Export for module detection
export {};
