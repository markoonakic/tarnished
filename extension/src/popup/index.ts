/**
 * Popup script for Tarnished extension
 * Handles the popup UI state management and user interactions
 */

import browser from 'webextension-polyfill';
import {
  getSettings,
  getAutoFillOnLoad,
  setAutoFillOnLoad,
} from '../lib/storage';
import {
  checkExistingLead,
  checkExistingApplication,
  convertLeadToApplication,
  getProfile,
  extractApplication,
  getStatuses,
  type JobLeadResponse,
  type ApplicationResponse,
} from '../lib/api';
import { hasAutofillData } from '../lib/autofill';
import { getErrorMessage, isRecoverable, mapApiError } from '../lib/errors';
import { debug, warn, error as logError } from '../lib/logger';
import { createPopupActions } from './actions';
import { createPopupAutofillController } from './autofill';
import {
  extractCompanyFromDocument,
  extractLocationFromDocument,
  extractTitleFromDocument,
  getFormDetectionFromContentScript,
  getTextFromContentScript,
  isRestrictedUrl,
  type FormDetectionState,
} from './detection';
import { getThemeColors, applyThemeToDocument } from './lib/theme';
import { createPopupSaveLeadController } from './save-job-lead';
import { createPopupSettingsController } from './settings';
import { createPopupStateController } from './state';
import {
  createPopupView,
  type JobInfo,
  type PopupState,
} from './view';

/**
 * Tab status from background script
 */
interface TabStatus {
  isJobPage: boolean;
  score: number;
  signals: string[];
  url: string;
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

/** Existing application info (if any) */
let existingApplication: ApplicationResponse | null = null;

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
  convertBtn: document.getElementById('convertBtn'),
  retryBtn: document.getElementById('retryBtn'),
  autofillBtnDetected: document.getElementById('autofillBtnDetected'),
  autofillBtnSaved: document.getElementById('autofillBtnSaved'),
  autofillBtnOnly: document.getElementById('autofillBtnOnly'),

  // Settings dropdown
  settingsDropdown: document.getElementById('settingsDropdown'),
  autoFillToggle: document.getElementById(
    'autoFillToggle'
  ) as HTMLInputElement | null,
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

const popupView = createPopupView(document, formDetection);
const popupSaveLead = createPopupSaveLeadController({
  deps: {
    getCurrentTabText,
    saveJobLead: async (url, text) => {
      const { saveJobLead } = await import('../lib/api');
      return saveJobLead(url, text);
    },
    setJobStatus: async (url, status) => {
      const { setJobStatus } = await import('../lib/storage');
      await setJobStatus(url, status);
    },
  },
  ui: {
    showState,
    showError,
    showErrorNotification,
    showSuccessNotification,
    updateJobInfoDisplay: (info) => updateJobInfoDisplay(info, 'savedJob'),
  },
  state: {
    get currentTabUrl() {
      return currentTabUrl;
    },
    set currentTabUrl(value) {
      currentTabUrl = value;
    },
    get currentJobInfo() {
      return currentJobInfo;
    },
    set currentJobInfo(value) {
      currentJobInfo = value;
    },
    get existingLead() {
      return existingLead;
    },
    set existingLead(value) {
      existingLead = value;
    },
  },
  elements: {
    savedMessage: elements.savedMessage as { textContent: string | null } | null,
  },
  mapApiError,
  getErrorMessage,
  isRecoverable,
});
const popupAutofill = createPopupAutofillController({
  deps: {
    getProfile,
    sendAutofillMessage: (tabId, profile) =>
      browser.tabs.sendMessage(tabId, {
        type: 'AUTOFILL_FORM',
        profile,
      }) as Promise<{ filledCount?: number }>,
    hasAutofillData,
  },
  state: {
    get currentTabId() {
      return currentTabId;
    },
  },
  ui: {
    showNotification,
    showErrorNotification,
  },
  mapApiError,
  getErrorMessage,
});
const popupSettings = createPopupSettingsController({
  deps: {
    setAutoFillOnLoad,
    getAutoFillOnLoad,
    openOptionsPage: () => browser.runtime.openOptionsPage(),
    createTab: (options) => browser.tabs.create(options).then(() => undefined),
    getSettings: async () => {
      const settings = await getSettings();
      return { appUrl: settings.appUrl };
    },
  },
  state: {
    get settingsOpen() {
      return settingsOpen;
    },
    set settingsOpen(value) {
      settingsOpen = value;
    },
    get autoFillOnLoad() {
      return autoFillOnLoad;
    },
    set autoFillOnLoad(value) {
      autoFillOnLoad = value;
    },
    get existingLead() {
      return existingLead ? { id: existingLead.id } : null;
    },
    set existingLead(value) {
      existingLead = value ? ({ ...existingLead, id: value.id } as typeof existingLead) : null;
    },
    get existingApplication() {
      return existingApplication ? { id: existingApplication.id } : null;
    },
    set existingApplication(value) {
      existingApplication = value
        ? ({ ...existingApplication, id: value.id } as typeof existingApplication)
        : null;
    },
  },
  elements: {
    settingsDropdown: elements.settingsDropdown,
    settingsBtn: elements.settingsBtn,
    autoFillToggle: elements.autoFillToggle,
  },
  warn,
  logError,
});
const popupState = createPopupStateController({
  deps: {
    getSettings: async () => {
      const settings = await getSettings();
      return { appUrl: settings.appUrl, apiKey: settings.apiKey };
    },
    queryTabs: () => browser.tabs.query({ active: true, currentWindow: true }),
    getTabStatus: (tabId) =>
      browser.runtime.sendMessage({ type: 'GET_TAB_STATUS', tabId }) as Promise<TabStatus | null>,
    getDetection: (tabId) =>
      browser.tabs.sendMessage(tabId, {
        type: 'GET_DETECTION',
      }) as Promise<{ isJobPage?: boolean; score?: number; signals?: string[] } | null>,
    getFormDetection: getCurrentFormDetection,
    checkExistingLead,
    checkExistingApplication,
    isRestrictedUrl,
    extractTitle: () => extractTitleFromDocument(document),
    extractCompany: () => extractCompanyFromDocument(document),
    extractLocation: () => extractLocationFromDocument(document),
  },
  ui: {
    showState,
    showError,
    updateJobInfoDisplay,
    setFormDetectionState,
  },
  state: {
    get currentTabId() {
      return currentTabId;
    },
    set currentTabId(value) {
      currentTabId = value;
    },
    get currentTabUrl() {
      return currentTabUrl;
    },
    set currentTabUrl(value) {
      currentTabUrl = value;
    },
    get currentJobInfo() {
      return currentJobInfo;
    },
    set currentJobInfo(value) {
      currentJobInfo = value;
    },
    get existingLead() {
      return existingLead;
    },
    set existingLead(value) {
      existingLead = value;
    },
    get existingApplication() {
      return existingApplication;
    },
    set existingApplication(value) {
      existingApplication = value;
    },
  },
  elements: {
    savedMessage: elements.savedMessage as { textContent: string | null } | null,
    convertBtn: elements.convertBtn as {
      classList: { add: (token: string) => void; remove: (token: string) => void };
    } | null,
  },
  warn,
  getErrorMessage,
  isRecoverable,
});
const popupActions = createPopupActions({
  deps: {
    getStatuses,
    extractApplication,
    convertLeadToApplication,
    getCurrentTabText,
  },
  ui: {
    showState,
    showError,
    showErrorNotification,
    showApplicationSuccessNotification,
    showNotification,
    updateJobInfoDisplay: (info) => updateJobInfoDisplay(info, 'savedJob'),
  },
  state: {
    get currentTabUrl() {
      return currentTabUrl;
    },
    set currentTabUrl(value) {
      currentTabUrl = value;
    },
    get currentJobInfo() {
      return currentJobInfo;
    },
    set currentJobInfo(value) {
      currentJobInfo = value;
    },
    get existingLead() {
      return existingLead;
    },
    set existingLead(value) {
      existingLead = value;
    },
    get existingApplication() {
      return existingApplication;
    },
    set existingApplication(value) {
      existingApplication = value;
    },
    get appliedStatusId() {
      return appliedStatusId;
    },
    set appliedStatusId(value) {
      appliedStatusId = value;
    },
  },
  elements: {
    get savedMessage() {
      return elements.savedMessage as { textContent: string | null } | null;
    },
    get viewBtn() {
      return elements.viewBtn as unknown as {
        textContent: string;
        dataset: Record<string, string>;
      } | null;
    },
    get convertBtn() {
      return elements.convertBtn as unknown as {
        classList: { add: (token: string) => void };
      } | null;
    },
  },
  debug,
  warn,
  mapApiError,
  getErrorMessage,
  isRecoverable,
});

function setFormDetectionState(next: FormDetectionState): void {
  formDetection = next;
  popupView.setFormDetection(next);
}

// ============================================================================
// State Management
// ============================================================================

/**
 * Shows the specified state and hides all others
 */
function showState(state: PopupState): void {
  popupView.showState(state);
}

/**
 * Updates the visibility of autofill sections based on form detection state
 */
function updateAutofillVisibility(state: PopupState): void {
  popupView.setFormDetection(formDetection);
  popupView.updateAutofillVisibility(state);
}

/**
 * Update job info display in the UI
 */
function updateJobInfoDisplay(info: JobInfo, prefix: 'job' | 'savedJob'): void {
  popupView.updateJobInfoDisplay(info, prefix);
}

/**
 * Shows the error state with a specific message
 */
function showError(message: string, recoverable: boolean = true): void {
  popupView.showError(message, recoverable);
}

// ============================================================================
// Settings Dropdown
// ============================================================================

/**
 * Toggles the settings dropdown visibility
 */
function toggleSettingsDropdown(): void {
  popupSettings.toggleSettingsDropdown();
}

/**
 * Closes the settings dropdown if clicking outside
 */
function handleDocumentClick(event: MouseEvent): void {
  popupSettings.handleDocumentClick(event);
}

/**
 * Handles the auto-fill toggle change
 */
async function handleAutoFillToggle(): Promise<void> {
  await popupSettings.handleAutoFillToggle();
}

/**
 * Loads the auto-fill on load setting from storage
 */
async function loadAutoFillSetting(): Promise<void> {
  await popupSettings.loadAutoFillSetting();
}

// ============================================================================
// Notifications
// ============================================================================

/**
 * Show a browser notification
 */
async function showNotification(title: string, message: string): Promise<void> {
  try {
    await browser.notifications.create({
      type: 'basic',
      iconUrl: '/icons/icon48.png',
      title,
      message,
    });
  } catch (error) {
    warn('Popup', 'Failed to show notification:', error);
  }
}

/**
 * Show a success notification for saved job lead
 */
function showSuccessNotification(
  title: string | null,
  company: string | null
): void {
  const jobTitle = title || 'Job Lead';
  const companyText = company ? ` at ${company}` : '';
  showNotification(
    'Job Saved!',
    `${jobTitle}${companyText} has been saved to Job Leads.`
  );
}

/**
 * Show a success notification for saved application
 */
function showApplicationSuccessNotification(
  title: string | null,
  company: string | null
): void {
  const jobTitle = title || 'Application';
  const companyText = company ? ` at ${company}` : '';
  showNotification(
    'Application Added!',
    `${jobTitle}${companyText} has been added as an application.`
  );
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
  popupSettings.openSettings();
}

/**
 * Opens the Job Leads page in the web app
 */
function openJobLeads(): void {
  void popupSettings.openJobLeads();
}

/**
 * Opens the Applications page in the web app
 */
function openApplications(applicationId?: string): void {
  void popupSettings.openApplications(applicationId);
}

/**
 * Saves the current job lead to the backend
 */
async function saveJobLead(): Promise<void> {
  await popupSaveLead.saveJobLead();
}

/**
 * Saves the job directly as an application with "Applied" status
 */
async function saveAsApplication(): Promise<void> {
  await popupActions.saveAsApplication();
}

/**
 * Convert an existing job lead to an application.
 * Called when user clicks "Convert to Application" button.
 */
async function handleConvertToApplication(): Promise<void> {
  await popupActions.handleConvertToApplication();
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
  await popupAutofill.autofillFormHandler();
}

// ============================================================================
// Content Script Communication
// ============================================================================

/**
 * Get text content from the content script
 */
async function getCurrentTabText(): Promise<string> {
  if (!currentTabId) {
    throw new Error('No active tab');
  }

  return getTextFromContentScript(currentTabId);
}

/**
 * Get form detection state from content script
 */
async function getCurrentFormDetection(): Promise<FormDetectionState | null> {
  try {
    return await getFormDetectionFromContentScript(currentTabId);
  } catch (error) {
    warn('Popup', 'Failed to get form detection from content script:', error);
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
  await popupState.determineState();
}

/**
 * Check if URL is restricted (chrome://, about:, etc.)
 */
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
    // Priority: newly created application > existing application > existing lead
    const newApplicationId = elements.viewBtn?.dataset.applicationId;
    if (newApplicationId) {
      openApplications(newApplicationId);
    } else if (existingApplication) {
      openApplications(existingApplication.id);
    } else if (existingLead) {
      openJobLeads();
    } else {
      openJobLeads();
    }
  });
  elements.convertBtn?.addEventListener('click', handleConvertToApplication);
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
    debug('Popup', 'Theme colors loaded:', colors);
    applyThemeToDocument(colors);
    debug('Popup', 'Applied theme, accent:', colors.accent);

    // Update favicon with accent color
    await updateFavicon(colors.accent);

    // Debug: Verify CSS variables were set
    const root = document.documentElement;
    debug('Popup', 'CSS var --accent:', root.style.getPropertyValue('--accent'));
  } catch (error) {
    warn('Popup', 'Failed to load theme:', error);
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

    debug('Popup', 'Updated favicon with accent color:', accentColor);
  } catch (error) {
    warn('Popup', 'Failed to update favicon:', error);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    logError('Popup', 'Failed to initialize popup:', error);
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
browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as {
    type: string;
    hasApplicationForm?: boolean;
    fillableFieldCount?: number;
  };
  if (msg.type === 'FORM_DETECTION_UPDATE') {
    setFormDetectionState({
      hasApplicationForm: msg.hasApplicationForm ?? false,
      fillableFieldCount: msg.fillableFieldCount ?? 0,
    });
    // Update autofill visibility based on new form detection state
    updateAutofillVisibility(popupView.getCurrentState());
  }
  return undefined;
});

// Export for module detection
export {};
