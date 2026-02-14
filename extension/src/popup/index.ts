/**
 * Popup script for Job Tracker extension
 * Handles the popup UI state management and user interactions
 */

import browser from 'webextension-polyfill';
import { getSettings, type Settings } from '../lib/storage';
import { checkExistingLead, type JobLeadResponse } from '../lib/api';

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
  | 'update'
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

// ============================================================================
// State Management
// ============================================================================

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
 * Update job info display in the UI
 */
function updateJobInfoDisplay(info: JobInfo, prefix: 'job' | 'savedJob' | 'updateJob'): void {
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
function showError(message: string): void {
  if (elements.errorText) {
    elements.errorText.textContent = message;
  }
  showState('error');
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
      const serverUrl = settings.serverUrl || 'http://localhost:8000';
      const url = existingLead
        ? `${serverUrl}/job-leads/${existingLead.id}`
        : `${serverUrl}/job-leads`;
      browser.tabs.create({ url }).catch((error) => {
        console.error('Failed to open job leads:', error);
      });
    })
    .catch((error) => {
      console.error('Failed to get settings for opening job leads:', error);
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
    // Get HTML from content script
    const html = await getHtmlFromContentScript();

    // Import the save function
    const { saveJobLead: saveLead } = await import('../lib/api');
    const result = await saveLead(currentTabUrl, html);

    // Update existing lead info
    existingLead = result;
    currentJobInfo = {
      title: result.title,
      company: result.company,
      location: result.location || null,
    };

    // Show success notification
    showSuccessNotification(result.title, result.company);

    // Show saved state
    updateJobInfoDisplay(currentJobInfo, 'savedJob');
    showState('saved');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save job lead';
    showError(message);
    showErrorNotification(message);
  }
}

/**
 * Updates an existing job lead
 * (Full implementation in Task 22)
 */
async function updateJobLead(): Promise<void> {
  // For now, same as save - backend will handle update
  await saveJobLead();
}

/**
 * Retries the last failed action
 */
async function retryAction(): Promise<void> {
  // Re-determine the state
  await determineState();
}

// ============================================================================
// Content Script Communication
// ============================================================================

/**
 * Get HTML content from the content script
 */
async function getHtmlFromContentScript(): Promise<string> {
  if (!currentTabId) {
    throw new Error('No active tab');
  }

  try {
    const response = await browser.tabs.sendMessage(currentTabId, {
      type: 'GET_HTML',
    });

    if (response && response.html) {
      return response.html;
    }

    throw new Error('No HTML content received');
  } catch (error) {
    throw new Error('Failed to get page content');
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
    if (!settings.serverUrl || !settings.apiKey) {
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

    // Step 5: Check if this URL already exists as a job lead
    try {
      existingLead = await checkExistingLead(currentTabUrl);
    } catch (error) {
      console.warn('Failed to check existing lead:', error);
      // Continue without existing lead info - user can still try to save
    }

    // Step 6: Determine the state to show
    if (existingLead) {
      // URL already saved
      currentJobInfo = {
        title: existingLead.title,
        company: existingLead.company,
        location: existingLead.location || null,
      };

      // Check if update is available (job page detected and content may have changed)
      if (tabStatus && tabStatus.isJobPage) {
        // Job page detected again - offer update
        updateJobInfoDisplay(currentJobInfo, 'updateJob');
        showState('update');
      } else {
        // Just show already saved
        updateJobInfoDisplay(currentJobInfo, 'savedJob');
        showState('saved');
      }
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
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    showError(message);
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
    'about:',
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
  elements.settingsBtn?.addEventListener('click', openSettings);
  elements.openSettingsBtn?.addEventListener('click', openSettings);
  elements.saveBtn?.addEventListener('click', saveJobLead);
  elements.viewBtn?.addEventListener('click', openJobLeads);
  elements.updateBtn?.addEventListener('click', updateJobLead);
  elements.retryBtn?.addEventListener('click', retryAction);
}

/**
 * Initialize the popup
 */
async function init(): Promise<void> {
  console.log('Job Tracker popup loaded');

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

// Export for module detection
export {};
