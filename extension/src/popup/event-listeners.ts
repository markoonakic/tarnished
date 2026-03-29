type ListenerElement = {
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject
  ) => void;
};

type ViewButtonElement = ListenerElement & {
  dataset?: DOMStringMap;
};

export function resolvePopupViewNavigation(options: {
  newApplicationId: string | null;
  existingApplicationId: string | null;
  existingLeadId: string | null;
}): { kind: 'application'; id: string } | { kind: 'jobLeads' } {
  if (options.newApplicationId) {
    return { kind: 'application', id: options.newApplicationId };
  }

  if (options.existingApplicationId) {
    return { kind: 'application', id: options.existingApplicationId };
  }

  return { kind: 'jobLeads' };
}

export function bindPopupEventListeners(options: {
  elements: {
    settingsBtn: ListenerElement | null;
    openSettingsBtn: ListenerElement | null;
    openSettingsFromDropdown: ListenerElement | null;
    autoFillToggle: ListenerElement | null;
    saveAsLeadBtn: ListenerElement | null;
    saveAsApplicationBtn: ListenerElement | null;
    viewBtn: ViewButtonElement | null;
    convertBtn: ListenerElement | null;
    retryBtn: ListenerElement | null;
    autofillBtnDetected: ListenerElement | null;
    autofillBtnSaved: ListenerElement | null;
    autofillBtnOnly: ListenerElement | null;
    settingsDropdown: { classList: { add: (token: string) => void } } | null;
  };
  document: Document;
  toggleSettingsDropdown: () => void;
  openSettings: () => void;
  closeSettingsDropdown: () => void;
  handleAutoFillToggle: () => void | Promise<void>;
  handleDocumentClick: (event: MouseEvent) => void;
  saveJobLead: () => void | Promise<void>;
  saveAsApplication: () => void | Promise<void>;
  openJobLeads: () => void;
  openApplications: (applicationId?: string) => void;
  getExistingApplicationId: () => string | null;
  getExistingLeadId: () => string | null;
  handleConvertToApplication: () => void | Promise<void>;
  retryAction: () => void | Promise<void>;
  autofillFormHandler: () => void | Promise<void>;
}): void {
  const {
    elements,
    document,
    toggleSettingsDropdown,
    openSettings,
    closeSettingsDropdown,
    handleAutoFillToggle,
    handleDocumentClick,
    saveJobLead,
    saveAsApplication,
    openJobLeads,
    openApplications,
    getExistingApplicationId,
    getExistingLeadId,
    handleConvertToApplication,
    retryAction,
    autofillFormHandler,
  } = options;

  elements.settingsBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSettingsDropdown();
  });
  elements.openSettingsBtn?.addEventListener('click', openSettings);
  elements.openSettingsFromDropdown?.addEventListener('click', () => {
    if (elements.settingsDropdown) {
      elements.settingsDropdown.classList.add('hidden');
    }
    closeSettingsDropdown();
    openSettings();
  });
  elements.autoFillToggle?.addEventListener('change', handleAutoFillToggle);

  document.addEventListener('click', handleDocumentClick);

  elements.saveAsLeadBtn?.addEventListener('click', saveJobLead);
  elements.saveAsApplicationBtn?.addEventListener('click', saveAsApplication);
  elements.viewBtn?.addEventListener('click', () => {
    const destination = resolvePopupViewNavigation({
      newApplicationId: elements.viewBtn?.dataset?.applicationId ?? null,
      existingApplicationId: getExistingApplicationId(),
      existingLeadId: getExistingLeadId(),
    });

    if (destination.kind === 'application') {
      openApplications(destination.id);
      return;
    }

    openJobLeads();
  });
  elements.convertBtn?.addEventListener('click', handleConvertToApplication);
  elements.retryBtn?.addEventListener('click', retryAction);

  elements.autofillBtnDetected?.addEventListener('click', autofillFormHandler);
  elements.autofillBtnSaved?.addEventListener('click', autofillFormHandler);
  elements.autofillBtnOnly?.addEventListener('click', autofillFormHandler);
}
