export type PopupState =
  | 'loading'
  | 'no-settings'
  | 'not-detected'
  | 'detected'
  | 'saved'
  | 'saving'
  | 'error';

export interface FormDetectionState {
  hasApplicationForm: boolean;
  fillableFieldCount: number;
}

export interface JobInfo {
  title: string | null;
  company: string | null;
  location: string | null;
}

type PopupElements = {
  stateLoading: HTMLElement | null;
  stateNoSettings: HTMLElement | null;
  stateNotDetected: HTMLElement | null;
  stateDetected: HTMLElement | null;
  stateSaved: HTMLElement | null;
  stateSaving: HTMLElement | null;
  stateError: HTMLElement | null;
  autofillDetectedSection: HTMLElement | null;
  autofillSavedSection: HTMLElement | null;
  autofillOnlySection: HTMLElement | null;
  autofillDetectedCount: HTMLElement | null;
  autofillSavedCount: HTMLElement | null;
  autofillOnlyCount: HTMLElement | null;
  jobTitle: HTMLElement | null;
  jobCompany: HTMLElement | null;
  jobLocation: HTMLElement | null;
  savedJobTitle: HTMLElement | null;
  savedJobCompany: HTMLElement | null;
  savedJobLocation: HTMLElement | null;
  errorText: HTMLElement | null;
  retryBtn: HTMLElement | null;
};

function getPopupElements(doc: Document): PopupElements {
  return {
    stateLoading: doc.getElementById('state-loading'),
    stateNoSettings: doc.getElementById('state-no-settings'),
    stateNotDetected: doc.getElementById('state-not-detected'),
    stateDetected: doc.getElementById('state-detected'),
    stateSaved: doc.getElementById('state-saved'),
    stateSaving: doc.getElementById('state-saving'),
    stateError: doc.getElementById('state-error'),
    autofillDetectedSection: doc.getElementById('autofillDetectedSection'),
    autofillSavedSection: doc.getElementById('autofillSavedSection'),
    autofillOnlySection: doc.getElementById('autofillOnlySection'),
    autofillDetectedCount: doc.getElementById('autofillDetectedCount'),
    autofillSavedCount: doc.getElementById('autofillSavedCount'),
    autofillOnlyCount: doc.getElementById('autofillOnlyCount'),
    jobTitle: doc.getElementById('jobTitle'),
    jobCompany: doc.getElementById('jobCompany'),
    jobLocation: doc.getElementById('jobLocation'),
    savedJobTitle: doc.getElementById('savedJobTitle'),
    savedJobCompany: doc.getElementById('savedJobCompany'),
    savedJobLocation: doc.getElementById('savedJobLocation'),
    errorText: doc.getElementById('errorText'),
    retryBtn: doc.getElementById('retryBtn'),
  };
}

export function createPopupView(
  doc: Document,
  initialFormDetection: FormDetectionState
) {
  const elements = getPopupElements(doc);
  const stateContainers: Record<PopupState, HTMLElement | null> = {
    loading: elements.stateLoading,
    'no-settings': elements.stateNoSettings,
    'not-detected': elements.stateNotDetected,
    detected: elements.stateDetected,
    saved: elements.stateSaved,
    saving: elements.stateSaving,
    error: elements.stateError,
  };

  let currentState: PopupState = 'loading';
  let formDetection = initialFormDetection;

  function updateAutofillVisibility(state: PopupState): void {
    const showAutofill =
      formDetection.hasApplicationForm || formDetection.fillableFieldCount >= 1;
    const countText = `${formDetection.fillableFieldCount} field${formDetection.fillableFieldCount !== 1 ? 's' : ''}`;

    elements.autofillDetectedCount &&
      (elements.autofillDetectedCount.textContent = countText);
    elements.autofillSavedCount &&
      (elements.autofillSavedCount.textContent = countText);
    elements.autofillOnlyCount &&
      (elements.autofillOnlyCount.textContent = countText);

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

  function showState(state: PopupState): void {
    currentState = state;
    Object.values(stateContainers).forEach((container) => {
      container?.classList.add('hidden');
    });
    stateContainers[state]?.classList.remove('hidden');
    updateAutofillVisibility(state);
  }

  function updateJobInfoDisplay(info: JobInfo, prefix: 'job' | 'savedJob'): void {
    const titleEl = elements[`${prefix}Title` as const];
    const companyEl = elements[`${prefix}Company` as const];
    const locationEl = elements[`${prefix}Location` as const];

    if (titleEl) titleEl.textContent = info.title || 'Unknown Position';
    if (companyEl) companyEl.textContent = info.company || '';
    if (locationEl) locationEl.textContent = info.location || '';
  }

  function showError(message: string, recoverable = true): void {
    if (elements.errorText) {
      elements.errorText.textContent = message;
    }
    elements.retryBtn?.classList.toggle('hidden', !recoverable);
    showState('error');
  }

  function setFormDetection(next: FormDetectionState): void {
    formDetection = next;
    updateAutofillVisibility(currentState);
  }

  return {
    getCurrentState: () => currentState,
    setFormDetection,
    showState,
    showError,
    updateAutofillVisibility,
    updateJobInfoDisplay,
  };
}
